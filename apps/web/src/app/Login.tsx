import {useState} from 'react';
import {Logo} from '../brand';
import {auth} from '../session';
import {track} from '../track';
import {goTo,navigate} from './ui';

type Mode='login'|'signup'|'reset';
const authError=(error:{message?:string;code?:string}|null|undefined)=>{if(!error)return null;if(error.code==='INVALID_EMAIL_OR_PASSWORD')return 'That email and password don’t match.';if(error.code==='USER_ALREADY_EXISTS'||error.code==='USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')return 'An account with that email already exists. Sign in instead.';if(error.code==='INVALID_ORIGIN')return 'Sign-in isn’t enabled for this address yet. Please contact support.';return error.message||'Something went wrong. Please try again.'};

/** Sign in, create an account, or reset a password with a code emailed by Neon Auth. Success opens the portal. */
export default function Login({mode}:{mode:Mode}){
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[name,setName]=useState('');const[code,setCode]=useState('');
  const[codeSent,setCodeSent]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);const[notice,setNotice]=useState<string|null>(null);
  const go=(m:Mode)=>{setError(null);setNotice(null);setCodeSent(false);navigate(`#/${m}`)};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError(null);setNotice(null);
    try{
      if(mode==='login'){const {error:err}=await auth.signIn.email({email:email.trim(),password});if(err)return setError(authError(err));navigate('#/overview')}
      else if(mode==='signup'){if(password.length<8)return setError('Use at least 8 characters for your password.');const {error:err}=await auth.signUp.email({email:email.trim(),password,name:name.trim()||email.split('@')[0]});if(err)return setError(authError(err));track('sign_up',{method:'email'});goTo('/welcome')}
      else if(!codeSent){const {error:err}=await auth.forgetPassword.emailOtp({email:email.trim()});if(err)return setError(authError(err));setCodeSent(true);setNotice('If an account exists for that email, we’ve sent a 6-digit code.')}
      else{if(password.length<8)return setError('Use at least 8 characters for your password.');const {error:err}=await auth.emailOtp.resetPassword({email:email.trim(),otp:code.trim(),password});if(err)return setError(authError(err));setNotice('Password updated. Sign in with your new password.');setCodeSent(false);navigate('#/login')}
    }catch(err){setError(authError(err as {message?:string}))}finally{setBusy(false)}};
  const title=mode==='signup'?'Create your account':mode==='reset'?'Reset your password':'Sign in';
  return <div className="authpage">
    <a href="#" className="authlogo" onClick={e=>{e.preventDefault();navigate('')}}><Logo/></a>
    <form className="panel authcard" onSubmit={submit}>
      <h1>{title}</h1>
      {mode==='signup'&&<p className="hint">Start monitoring your brand in AI search. You’ll choose a plan after setting up your project.</p>}
      {error&&<div className="formerror" role="alert">{error}</div>}{notice&&<div className="formnotice" role="status">{notice}</div>}
      <div className="fields single">
        {mode==='signup'&&<label>Your name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={80}/></label>}
        <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={254} disabled={mode==='reset'&&codeSent}/></label>
        {mode==='reset'&&codeSent&&<label>Code from your email<input inputMode="numeric" required value={code} onChange={e=>setCode(e.target.value)} autoComplete="one-time-code" maxLength={8}/></label>}
        {(mode!=='reset'||codeSent)&&<label>{mode==='reset'?'New password':'Password'}<input type="password" required minLength={mode==='login'?1:8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'}/></label>}
      </div>
      <button disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?(codeSent?'Set new password':'Email me a code'):'Sign in'}</button>
      <p className="authlinks">{mode==='login'?<><a onClick={()=>go('signup')}>Create an account</a><a onClick={()=>go('reset')}>Forgot password?</a></>:<a onClick={()=>go('login')}>Already have an account? Sign in</a>}</p>
      {mode==='signup'&&<p className="hint small">By creating an account you agree to the Terms and Privacy Policy.</p>}
    </form>
  </div>
}
