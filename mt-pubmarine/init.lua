
local ie = nil
local require = nil
local socket = nil
local assert = nil

local udp = nil

local hostport = 10209
local hostname = "0.0.0.0"

if minetest ~= nil and minetest.request_insecure_environment ~= nil then
  ie = minetest.request_insecure_environment()
  require = ie.require
  assert = ie.assert
  socket = require("socket")
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
  self.udp_socket.setpeername(self.hostname, self.hostport)
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
        _cb(json.reponse.id, json.response.change, false)
      end
    )
    return
  elseif msg.response.type == "sub-inst" then
    self.walkSubscribers(
      msg.response.topic,
      nil,
      function (_cb)
        _cb(json.reponse.id, nil, true)
      end
    )
    return
  end

  local resolve = self.responseResolvers[json.id]
  if resolve then
    --if we did, json.response is our answer and we stop listening
    self.responseResolvers[json.id] = nil
    resolve(json) --json.error should be handled by callback
  end
end

function Client:step ()
  local data = self.udp_socket:receive()
  local msg = minetest.parse_json(data)
  if msg ~= nil and msg.id ~= nil then
    self.handleMsgRes(msg)
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
    id = self.generateMessageId()
  }
  local str = minetest.serialize(req)
  self.sendString(str)

  if onResolved ~= nil then
    self.responseResolvers[msg.id] = onResolved
  end
end

--id may be nil
function Client:addSubscriber(topic, id, cb)
  local topicSubs = self.topicSubsGetOrCreate(topic)
  if id ~= nil then
    local list = self.instanceSubsListGetOrCreate(topicSubs, id)
    table.insert(list, cb)
  else
    table.insert(topicSubs, cb)
  end
end

function Client:authenticate(req, cb)
  self.sendMessage("auth", req, function (res)
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
  self.addSubscriber(topic, cfg.id, cb);
  print("[sub]" .. cfg)
  self.sendMessage("sub", cfg, onResolved)
end
function Client:unsubscribe(topic, onResolved)
  self.sendMessage("unsub", { topic = topic }, onResolved);
end

function Client:createSchema(topic, shape, onResolved)
  print("[schema] creating" .. topic)
  self.sendMessage("schema-set", { topic = topic, shape = shape }, onResolved);
end

function Client:getSchema(topic, onResolved)
  self.sendMessage("schema-get", { topic = topic }, onResolved);
end
function Client:hasSchema(topic, onResolved)
  print("[schema] check exists" .. topic)
  self.getSchema(topic, function (res)
      onResolved(res.error == nil)
  end)
end
function Client:instance(topic, onResolved)
  print("[schema] instance" .. topic)
  self.sendMessage(
    "instance", { topic = topic },
    onResolved
  )
end

function Client:listInstances(topic, onResolved)
  print("[schema] list " .. topic);
  self.sendMessage("list", {
    topic = topic
  }, onResolved)
end

function Client:mutate(topic, id, data, onResolved)
  self.sendMessage("mut", {
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
  local result = false
  if delta > d.timeWait then
    result = true
  end

  d.timeLast = timeNow

  return result
end

function test ()
  local client = Client:new("0.0.0.0", 10209)
  client:connect()
  
  local d_net = debounce_create(250)

  minetest.register_globalstep(function(dtime)
    if debounce_check(d_net) then
      client:step()
    end
  end)

end

-- test()
