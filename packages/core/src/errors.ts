export type ErrorCode = 'VALIDATION_ERROR'|'AUTHENTICATION_ERROR'|'AUTHORIZATION_ERROR'|'QUOTA_EXCEEDED'|'BILLING_ERROR'|'PROVIDER_ERROR'|'PROVIDER_RATE_LIMIT'|'PROVIDER_TIMEOUT'|'EXPORT_ERROR'|'DATABASE_ERROR'|'QUEUE_ERROR'|'CONFIGURATION_ERROR'|'INTERNAL_ERROR';
export class AppError extends Error { constructor(public code:ErrorCode, message:string, public status=500, public recoverable=false, public details?:Record<string,unknown>){super(message);this.name='AppError'} }
export const errorResponse=(error:unknown,requestId:string)=>{const known=error instanceof AppError;return {success:false as const,error:{code:known?error.code:'INTERNAL_ERROR',message:known?error.message:'Something went wrong. Please try again.',requestId}}};
export class ValidationError extends AppError { constructor(message:string,details?:Record<string,unknown>){super('VALIDATION_ERROR',message,400,false,details)} }
export class QuotaExceededError extends AppError { constructor(){super('QUOTA_EXCEEDED','This run exceeds your plan allowance.',409)} }
export class ProviderTimeoutError extends AppError { constructor(provider:string){super('PROVIDER_TIMEOUT',`${provider} did not respond in time.`,504,true)} }
