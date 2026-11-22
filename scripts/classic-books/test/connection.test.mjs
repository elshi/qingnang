import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {rootCertificates} from 'node:tls';
import {connectionOptions} from '../connection.mjs';

const credentials={BOOKS_DB_USER:'test',BOOKS_DB_PASSWORD:'test-password'};
test('local connection defaults stay local and require credentials',async()=>{
  const options=await connectionOptions(credentials);
  assert.equal(options.host,'127.0.0.1');
  assert.equal(options.database,'qingnang');
  assert.equal(options.multipleStatements,false);
  await assert.rejects(()=>connectionOptions({}),/BOOKS_DB_USER/);
  await assert.rejects(()=>connectionOptions({...credentials,BOOKS_DB_PORT:'bad'}),/Invalid BOOKS_DB_PORT/);
});
test('remote connection requires explicit enablement and a trusted CA file',async()=>{
  const env={...credentials,BOOKS_DB_HOST:'db.example.com'};
  await assert.rejects(()=>connectionOptions(env),/BOOKS_DB_ALLOW_REMOTE/);
  await assert.rejects(()=>connectionOptions({...env,BOOKS_DB_ALLOW_REMOTE:'1'}),/BOOKS_DB_SSL_CA/);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'qingnang-ca-test-'));
  const file=path.join(directory,'ca.pem');
  try{
    await fs.writeFile(file,rootCertificates[0]);
    const options=await connectionOptions({...env,BOOKS_DB_ALLOW_REMOTE:'1',BOOKS_DB_SSL_CA:file});
    assert.equal(options.ssl.rejectUnauthorized,true);
    assert.equal(options.ssl.minVersion,'TLSv1.2');
    assert.equal(options.ssl.ca,rootCertificates[0]);
    assert.equal(options.ssl.verifyIdentity,false);
    const strict=await connectionOptions({...env,BOOKS_DB_ALLOW_REMOTE:'1',BOOKS_DB_SSL_CA:file,BOOKS_DB_SSL_VERIFY_IDENTITY:'1'});
    assert.equal(strict.ssl.verifyIdentity,true);
    await fs.writeFile(file,'invalid');
    await assert.rejects(()=>connectionOptions({...env,BOOKS_DB_ALLOW_REMOTE:'1',BOOKS_DB_SSL_CA:file}),/PEM CA/);
  }finally{await fs.unlink(file);await fs.rmdir(directory);}
});
