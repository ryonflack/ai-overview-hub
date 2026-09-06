const sensitive=/password|token|secret|authorization|cookie|api.?key/i;
export const scrub=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sensitive.test(k)?'[REDACTED]':scrub(v)]));return value};
export interface ErrorReporter { captureException(error:Error,context?:Record<string,unknown>):void; captureMessage(message:string,context?:Record<string,unknown>):void }
export class ConsoleReporter implements ErrorReporter { captureException(error:Error,context={}){console.error(JSON.stringify({level:'error',event:'exception',message:error.message,...scrub(context) as object}))}captureMessage(message:string,context={}){console.log(JSON.stringify({level:'info',event:'message',message,...scrub(context) as object}))} }
export class NoopReporter implements ErrorReporter { captureException(){} captureMessage(){} }
