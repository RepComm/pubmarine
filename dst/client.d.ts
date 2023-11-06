import type { ClientAuthRes, ClientAuthReq, MsgRes, MsgResResponse, Shape, SubConfig, SchemaGetRes, InstanceRes, ListInstancesRes } from "./common.d.ts";
export interface OnChange<InstanceType> {
    (data: InstanceType): void;
}
export interface Resolver<T> {
    (v: T): void;
}
export interface ResolveReject<T> {
    resolve: Resolver<T>;
    reject: (reason?: any) => void;
}
export interface SubCb<T> {
    (id: string, change?: T, isNewInstance?: true): void;
}
export type TopicId = string;
export type InstanceId = string;
export type InstanceSubs = Map<InstanceId, Set<SubCb<any>>>;
export interface TopicSubs {
    cbs: Set<SubCb<any>>;
    instanceSubs: InstanceSubs;
}
export declare class Client {
    ws: WebSocket;
    host: string;
    auth: ClientAuthRes;
    authResolver: () => void;
    lastMessageId: number;
    generateMessageId(): number;
    responseResolvers: Map<number, ResolveReject<MsgRes<any>>>;
    subscriptions: Map<TopicId, TopicSubs>;
    constructor(host: string);
    topicSubsGetOrCreate(topic: string): TopicSubs;
    instanceSubsListGetOrCreate(topicSubs: TopicSubs, id: string): Set<SubCb<any>>;
    addSubscriber<T>(topic: string, id: string, cb: SubCb<T>): void;
    walkSubscribers<T>(topic: string, id: string, cb: (_cb: SubCb<T>) => void): void;
    connect(): Promise<void>;
    sendMessage<Response extends MsgResResponse>(type: string, msg: any): Promise<MsgRes<Response>>;
    authenticate(req: ClientAuthReq): Promise<MsgRes<ClientAuthRes>>;
    subscribe<InstanceType>(topic: string | SubConfig, cb: SubCb<InstanceType>): Promise<MsgRes<MsgResResponse>>;
    unsubscribe(topic: string): Promise<MsgRes<MsgResResponse>>;
    createSchema(topic: string, shape: Shape): Promise<MsgRes<MsgResResponse>>;
    getSchema(topic: string): Promise<MsgRes<SchemaGetRes>>;
    hasSchema(topic: string): Promise<boolean>;
    instance(topic: string): Promise<MsgRes<InstanceRes>>;
    listInstances<T>(topic: string): Promise<MsgRes<ListInstancesRes<T>>>;
    echo(msg: string): Promise<MsgRes<MsgResResponse>>;
    mutate(topic: string, id: string, data: any): Promise<MsgRes<MsgResResponse>>;
}
