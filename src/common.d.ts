
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
export interface MsgRes<T> {
  id: number;
  response: T;
} 

export interface InstanceReq {
  topic: string;
}
export interface InstanceRes<InstanceType> {
  id: string;
  data: InstanceType;
}
