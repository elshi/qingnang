import fs from 'node:fs/promises';

// Remote imports must be explicitly enabled and use the instance's trusted CA.
// Credentials remain in the process environment; no credentials are persisted.
export async function connectionOptions(env=process.env) {
  const host=env.BOOKS_DB_HOST||'127.0.0.1';
  const local=['127.0.0.1','localhost','::1'].includes(host);
  if(!local&&env.BOOKS_DB_ALLOW_REMOTE!=='1')throw new Error('Set BOOKS_DB_ALLOW_REMOTE=1 to use the explicitly selected remote database');
  if(!local&&!env.BOOKS_DB_SSL_CA)throw new Error('Remote connections require BOOKS_DB_SSL_CA pointing to the trusted instance CA PEM file');
  const database=env.BOOKS_DB_DATABASE||'qingnang';
  if(database!=='qingnang'&&!/^qingnang_books_test_[a-z0-9_]+$/.test(database))throw new Error('Expected qingnang or an isolated qingnang_books_test_* database');
  if(!env.BOOKS_DB_USER||env.BOOKS_DB_PASSWORD===undefined)throw new Error('Set BOOKS_DB_USER and BOOKS_DB_PASSWORD; credentials are not read from repository files');
  const port=Number(env.BOOKS_DB_PORT||3306);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid BOOKS_DB_PORT');
  const options={host,port,user:env.BOOKS_DB_USER,password:env.BOOKS_DB_PASSWORD,database,charset:'utf8mb4',connectTimeout:15000,multipleStatements:false};
  if(env.BOOKS_DB_SSL_CA){
    const ca=await fs.readFile(env.BOOKS_DB_SSL_CA,'utf8');
    if(!ca.includes('-----BEGIN CERTIFICATE-----'))throw new Error('BOOKS_DB_SSL_CA must contain a PEM CA certificate');
    // VERIFY_CA supports cloud instance certificates issued for internal names.
    // The supplied CA must come from the selected instance's cloud console.
    options.ssl={ca,rejectUnauthorized:true,verifyIdentity:env.BOOKS_DB_SSL_VERIFY_IDENTITY==='1',minVersion:'TLSv1.2'};
  }
  return options;
}
