
export interface ClientAuthReq {
  apiKey: string;
}

export interface ClientAuth {

}

export interface ShapeTypeMap {
  "string": string;
  "number": number;
  "number[]": number[];
  "Uint8Array": Uint8Array;
  "Float32Array": Float32Array;
  "dict": Shape;
}

export type ShapeTypes = keyof ShapeTypeMap;

export interface Shape {
  // name: string;
  type: ShapeTypes;
  /**Not required for string or number[], n/a for number and shape
   * 
   * required for Uint8Array and Float32Array
   * 
   * type === string, the max size of the string in char codes
   * type === Uint8Array, the fixed count of bytes the array holds
   * type === Float32Array, the fixed count of floats the array holds
   */
  maxSize?: number;
  children?: {[key: string]: ShapeTypeMap[ShapeTypes]}
}

export interface MsgReq<T> {
  id: number;
  type: string;
  msg: T;
}
export interface MsgResResponse {
  type: string;
}
export interface MsgRes<T extends MsgResResponse> {
  id: number;
  response: T;
  error?: string;
} 

export type InstanceReq = MsgReq<{topic: string}>;
// export type InstanceRes = MsgRes<{id: string}>;
export type MutateReq = MsgReq<{
  topic: string;
  id: string;
  change: any;
}>;
export type SchemaCreateReq = MsgReq<{topic: string, shape: Shape}>;

export interface SubConfig {
  /**Which schema to subscribe to*/
  topic: string;
  /**ID of specific instance if applicable*/
  id?: string;
}
