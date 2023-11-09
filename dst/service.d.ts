/// <reference types="node" />
/// <reference types="node" />
import type { connection } from "websocket";
import { RemoteInfo, Socket, SocketType } from "dgram";
import type { MsgReq, MsgRes, Shape } from "./common";
import { Server as HttpServer } from "http";
import { server as WebSocketServer } from "websocket";
export declare class Client<ConnType> {
    service: Service<ConnType>;
    connection: ConnType;
    constructor(service: Service<ConnType>, conn: ConnType);
    send(msg: MsgRes<any>): void;
}
interface SubStorage {
    topicSubscribers: Set<Client<any>>;
    idSubScribers: Map<string, Set<Client<any>>>;
}
export type Subscriptions = Map<string, SubStorage>;
export interface ServiceListenResult {
}
export type ClientId = any;
export declare class Service<ConnType> {
    clients: Map<ClientId, Client<any>>;
    services: Services;
    constructor(services: Services);
    addClient(): void;
    listen(address: string, port: number): Promise<ServiceListenResult>;
    handleError(ex: any): void;
    handleMsgReqFromClient(client: Client<any>, msg: MsgReq<any>): Promise<void>;
    protected sendString(to: Client<any>, msg: string): void;
    send(to: Client<any>, msg: MsgRes<any>): void;
    getOrCreateClient<ConnType>(clientId: ConnType, clientConn?: any): Client<ConnType>;
    removeClient<ConnType>(clientId: ConnType): void;
}
interface DataStorage {
    shape: Shape;
    instances: Map<string, any>;
}
export interface AuthFunc {
    (msg: MsgReq<any>): Promise<string>;
}
export declare class Services {
    services: Set<Service<any>>;
    subscriptions: Subscriptions;
    authFunc: AuthFunc;
    schemas: Map<string, DataStorage>;
    constructor(authFunc: AuthFunc);
    setAuthFunc(authFunc: AuthFunc): void;
    addService(s: Service<any>): void;
    listen(hostname: string, startPort: number): void;
    subStorageGetOrCreate(topic: string): SubStorage;
    idSubsListGetOrCreate(storage: SubStorage, id: string): Set<Client<any>>;
    addSubscriber(topic: string, id: string, c: Client<any>): void;
    walkSubscribers(topic: string, id: string, cb: (client: Client<any>) => void): void;
    handleMsgReqFromClient(c: Client<any>, req: MsgReq<any>): Promise<void>;
    handleError(ex: any): void;
}
export declare class UdpService extends Service<RemoteInfo> {
    serverSocket: Socket;
    constructor(services: Services, udpVersion?: SocketType);
    sendString(to: Client<RemoteInfo>, msg: string): void;
    listen(address: string, port: number): Promise<unknown>;
}
export interface WSSOriginAllowed {
    (origin: string): boolean;
}
export declare class WebSocketService extends Service<connection> {
    wss: WebSocketServer;
    constructor(services: Services, httpServer: HttpServer, isOriginAllowed: WSSOriginAllowed);
    sendString(to: Client<connection>, msg: string): void;
    listen(address: string, port: number): Promise<{}>;
}
export {};
