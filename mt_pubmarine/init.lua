
local socket = nil

local udp = nil

local hostport = 10209
local hostname = "0.0.0.0"

if minetest ~= nil and minetest.request_insecure_environment ~= nil then
  local ie = minetest.request_insecure_environment()
  socket = ie.require("socket")
end

local Client = {}
Client.__index = Client

function Client:new (hostname, hostport)
  local self = setmetatable({}, Client)
  self.udp_socket = nil
  self.hostname = hostname
  self.hostport = hostport
  self.responseResolvers = {}
  self.subscriptions = {}
  self.lastMessageId = nil
  return self
end

function Client:connect ()
  self.udp_socket = socket.udp()
  
  --don't block when trying to receive data, must check for no data
  self.udp_socket:settimeout(0)
  
  self.udp_socket:setsockname("*", 0)
  self.udp_socket:setpeername(self.hostname, self.hostport)
end

function Client:topicSubsGetOrCreate(topic)
  local result = self.subscriptions[topic]
  if result == nil then
    result = {
      cbs = {},
      instanceSubs = {}
    }
    self.subscriptions[topic] = result
  end
  return result
end

function Client:instanceSubsListGetOrCreate(topicSubs,id)
  local list = topicSubs.instanceSubs[id]
  if list == nil then
    list = {}
    topicSubs.instanceSubs[id] = list
  end
  return list
end

--id can be nil
function Client:walkSubscribers(topic, id, cb)
  local topicSubs = self.subscriptions[topic]
  if topicSubs == nil then return end

  --if walkSubscribers caller supplies an instance ID
  if id ~= nil then
    --try to call topic:id subscribers first if present
    local idSubs = topicSubs.instanceSubs[id]
    if idSubs ~= nil then
      for i,_cb in ipairs(idSubs) do
        cb(_cb)
      end
    end
  end
  --try to call topic:any subscribers after if present
  for i,_cb in ipairs(topicSubs.cbs) do
    cb(_cb)
  end
end

function Client:handleMsgRes (msg)
  if msg.response.type == "sub-mut" then
    self.walkSubscribers(
      msg.response.topic,
      msg.response.id,
      function (_cb)
        _cb(msg.reponse.id, msg.response.change, false)
      end
    )
    return
  elseif msg.response.type == "sub-inst" then
    self.walkSubscribers(
      msg.response.topic,
      nil,
      function (_cb)
        _cb(msg.reponse.id, nil, true)
      end
    )
    return
  end

  local resolve = self.responseResolvers[msg.id]
  if resolve then
    --if we did, json.response is our answer and we stop listening
    self.responseResolvers[msg.id] = nil
    resolve(msg) --json.error should be handled by callback
  end
end

function Client:step ()
  local data = self.udp_socket:receive()
  if data == nil then
    return
  end
  local msg = minetest.parse_json(data)
  if msg ~= nil and msg.id ~= nil then
    self:handleMsgRes(msg)
  end
end

function Client:sendString (msg)
  self.udp_socket:send(msg)
end

function Client:generateMessageId ()
  if self.lastMessageId == nil then
    self.lastMessageId = 0
  end
  self.lastMessageId = self.lastMessageId + 1
  return self.lastMessageId
end

function Client:sendMessage (type, req, onResolved)
  local msg = {
    type = type,
    msg = req,
    id = self:generateMessageId()
  }
  local str = minetest.write_json(msg)
  self:sendString(str)

  if onResolved ~= nil then
    self.responseResolvers[msg.id] = onResolved
  end
end

--id may be nil
function Client:addSubscriber(topic, id, cb)
  local topicSubs = self:topicSubsGetOrCreate(topic)
  if id ~= nil then
    local list = self:instanceSubsListGetOrCreate(topicSubs, id)
    table.insert(list, cb)
  else
    table.insert(topicSubs, cb)
  end
end

function Client:authenticate(req, cb)
  self:sendMessage("auth", req, function (res)
    if res.response ~= nil then
      --TODO handle error
      return
    end
    self.auth = res.response
    cb(cb)
  end)

  return res
end

function Client:subscribe(topic, cb, onResolved)
  local cfg = nil
  if type (topic) == "string" then
    cfg = {
      topic = topic
    };
  else
    cfg = topic
    topic = cfg.topic
  end
  self:addSubscriber(topic, cfg.id, cb);
  print("[sub] " .. dump(cfg))
  self:sendMessage("sub", cfg, onResolved)
end
function Client:unsubscribe(topic, onResolved)
  self:sendMessage("unsub", { topic = topic }, onResolved);
end

function Client:createSchema(topic, shape, onResolved)
  print("[schema] creating" .. dump(topic))
  self:sendMessage("schema-set", { topic = topic, shape = shape }, onResolved);
end

function Client:getSchema(topic, onResolved)
  self:sendMessage("schema-get", { topic = topic }, onResolved);
end
function Client:hasSchema(topic, onResolved)
  print("[schema] check exists" .. topic)
  self:getSchema(topic, function (res)
      onResolved(res.error == nil)
  end)
end
function Client:instance(topic, onResolved)
  print("[schema] instance req " .. topic)
  self:sendMessage(
    "instance", { topic = topic },
    onResolved
  )
end

function Client:listInstances(topic, onResolved)
  print("[schema] list " .. topic);
  self:sendMessage("list", {
    topic = topic
  }, onResolved)
end

function Client:mutate(topic, id, data, onResolved)
  self:sendMessage("mut", {
    topic = topic,
    id = id,
    change = data
  }, onResolved)
end

function debounce_create (timeWait)
  return {
    timeWait = timeWait,
    timeLast = 0
  }
end
function debounce_check(d)
  local timeNow = minetest.get_us_time()/1000
  local delta = timeNow - d.timeLast
  if delta > d.timeWait then
    d.timeLast = timeNow
    return true
  end

  return false
end

function test ()

  local client = Client:new("0.0.0.0", 10211)
  client:connect()
  local localId = nil

  local schemasOk = false

  client:hasSchema("players", function (exists)
    print("Schema players exists? " .. tostring(exists))
    if not exists then
      client:createSchema("players", {
        type = "dict",
        children = {
          x = { type = "number" },
          y = { type = "number" },
          name = { type = "string" }
        }
      }, function (res)
        schemasOk = true
      end)
    else
      schemasOk = true
    end
  end)

  local pnameInstMap = {}
  function pnameInstGetOrCreate(pname)
    local result = pnameInstMap[pname]
    if not result then
      result = {
        id = nil, --id string from pubmarine
        ref = nil, --a reference to minetest player obj
        data = { --data that should be uploaded to pubmarine
          name = pname,
          x = 0,
          y = 0,
          z = 0
        },
        --tracking last position so we don't send duplicates
        lpos = { x = 0, y = 0, z = 0 }
      }
      pnameInstMap[pname] = result
    end
    return result
  end

  function handle_player_join (player)
    local pname = player:get_player_name()
    local pdata = pnameInstGetOrCreate(pname)
    pdata.ref = player
  end

  local d_net = debounce_create(100)
  minetest.register_globalstep(function(dtime)
    if debounce_check(d_net) then
      client:step()

      --wait for schemas to upload if necessary
      if not schemasOk then
        return
      end

      --loop over all tracked players
      for pname,p in pairs(pnameInstMap) do
        -- print("Looping over " ..pname)
        --if we don't have an ID from pubmarine
        if p.id == nil then
          local _p = p
          _p.id = "-1" --avoid race conditions
          --get an id from pubmarine
          client:instance("players", function (res)
            _p.id = res.response.id
          end)

          goto continue
        end
        --if we don't have an id, but one is already being fetched
        if p.id == "-1" then
          --skip this player
          goto continue
        end
        
        --skip players without a reference
        if p.ref == nil then
          goto continue
        end

        local pos = p.ref:get_pos()
        pos.x = pos.x / 10
        pos.y = pos.z / 10 --flip y and z for /test.ts purposes
        pos.z = pos.y / 10 --flip y and z for /test.ts purposes
        if p.lpos.x ~= pos.x or p.lpos.y ~= pos.y or p.lpos.z ~= pos.z then
          p.data.x = pos.x
          p.data.y = pos.y
          p.data.z = pos.z

          client:mutate("players", p.id, p.data)
          p.lpos.x = pos.x
          p.lpos.y = pos.y
          p.lpos.z = pos.z
        
        end

        --a label to implement 'continue' functionality
        ::continue::
      end
      
      -- end
    end

  end)

  minetest.register_on_joinplayer(handle_player_join)

end

test()