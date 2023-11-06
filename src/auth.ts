
import type { MsgReq } from "./common";

export async function auth (msg: MsgReq<any>): Promise<string> {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
}
