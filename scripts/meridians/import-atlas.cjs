// Run against an explicitly configured MySQL schema. See docs/meridian-atlas.md.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');

const dataset = path.resolve(__dirname, '../../database/atlas');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const channels = read(path.join(dataset, 'channels.json'));
const references = read(path.join(dataset, 'point-references.json'));
const graphics = read(path.join(dataset, 'graphics.json'));
const keys = {
  t_meridians: ['meridian_id'], t_acupoints: ['acupoint_id'],
  t_meridian_atlas: ['meridian_id'], t_meridian_atlas_points: ['meridian_id','acupoint_id'],
  t_acupoint_review: ['acupoint_id']
};
const base = new Set(['t_meridians','t_acupoints']);
const clinical = ['alias','adscription','indications','locate','acupoints','acupuncture','precautions','points',
  'notes','meridian','pulse','fivepoint','specificpoint','position','five','abbreviation','pictures'];
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
  return value;
};
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const identity = (row, table) => keys[table].map(key => row[key]).join('/');
const sorted = (rows, table) => rows.sort((a,b) => keys[table].reduce((order,key) => order || a[key]-b[key],0));
const saveNew = (file,data) => fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});

function reviewPoint(row) {
  const title = row.name.normalize('NFKC');
  const [,name,code=''] = /^([^()]+?)(?:\(([A-Z-]+\d+\+?)\))?$/.exec(title) || [];
  const ref = references.find(p => code ? p.codes.includes(code) : p.name === name);
  const fields = {};
  for (const field of clinical) {
    const value = row[field] || '';
    const citations = Array.from(new Set(value.match(/《[^《》\r\n]{1,80}》/gu) || []));
    fields[field] = { status: value.trim() ? (citations.length ? '保留原录引文，版本待核' : '保留原录，出处待核') : '暂无可靠补录',
      ...(citations.length ? {citations} : {}) };
  }
  if (!ref) {
    assert(['EX-B5','EX-B9'].includes(code), '未匹配穴位 ' + title);
    return { code,name, review: {reference:'旧版经外穴目录',section:'历史条目，现行两项国标未收录',fields} };
  }
  assert(ref.name === name || ref.name === '金津玉液' && ['金津','玉液'].includes(name), title);
  row.pinyin = ref.name === '金津玉液' ? (name === '金津' ? 'Jīnjīn' : 'Yùyè') : ref.pinyin;
  assert(!ref.channel || (row.meridian || row.pulse) === ref.channel, '旧归属有差异 ' + title);
  const label = ref.reference + ' §' + ref.section;
  const facts = ref.location_summary || (ref.area + '。' + ref.landmarks.replaceAll(',', '，') + '。');
  const header = '【现行定位】' + label + '\n';
  if (!(row.locate || '').startsWith(header)) row.locate = header + facts + (row.locate ? '\n\n' + row.locate : '');
  fields.locate = {status:'国标定位已核，历史定位并列保留'};
  for (const field of ['name','pinyin',...(ref.channel ? [row.meridian ? 'meridian':'pulse'] : [])]) fields[field]={status:'国标已核'};
  return { code,name, review:{reference:ref.reference,section:ref.section,url:ref.url,area:ref.area,fields} };
}

function plan(before) {
  const target = JSON.parse(JSON.stringify(before));
  const expected = new Map();
  const reviews = [];
  const coverage = [];
  for (const row of target.t_acupoints) {
    const {code,name,review} = reviewPoint(row);
    if (code) {
      assert(!expected.has(code),'重复穴位编码 '+code);
      expected.set(code,{id:row.acupoint_id,name});
    }
    reviews.push({acupoint_id:row.acupoint_id,sources:JSON.stringify(review)});
  }
  assert.equal(reviews.length,416,'请从当前 416 条校订基线导入');
  const occupied = new Set(), links=[], entries=[];
  for (const [i,c] of channels.entries()) {
    const matches=target.t_meridians.filter(r=>r.name===c.title);
    assert.equal(matches.length,1,'目录无法唯一匹配 '+c.title);
    const row=matches[0], id=row.meridian_id;
    assert(!occupied.has(id)); occupied.add(id);
    const group=c.group === 'regular' ? '十二正经':'奇经八脉';
    if (!row.classification) row.classification=group;
    const plates=graphics.channels[c.key];
    assert.deepEqual(plates.flatMap(p=>p.codes).sort(),[...c.points].sort(),'图谱与索引不符 '+c.title);
    const names=c.points.map((code,index)=>{
      const point=expected.get(code);
      assert(point,'找不到 '+code);
      links.push({meridian_id:id,acupoint_id:point.id,kind:c.kind,point_code:code,display_order:index+1});
      return point.name;
    });
    if (!row.acupoints) row.acupoints=names.join('、');
    entries.push({meridian_id:id,slug:c.key,group_key:c.group,display_order:i+1,
      payload:JSON.stringify({route:c.route,sections:c.sections,code:c.code,color:c.color,kind:c.kind})});
    coverage.push({id,title:c.title,kind:c.kind,points:names.length,plates:plates.length});
  }
  assert.equal(occupied.size,20);
  const replaceManaged=(table,id,records)=>{
    target[table]=sorted(target[table].filter(r=>!id.has(r[keys[table][0]])).concat(records),table);
  };
  replaceManaged('t_meridian_atlas',occupied,entries);
  replaceManaged('t_meridian_atlas_points',occupied,links);
  replaceManaged('t_acupoint_review',new Set(reviews.map(r=>r.acupoint_id)),reviews);
  return { target, coverage };
}

function differences(before,after) {
  const changes=[];
  for (const table of Object.keys(keys)) {
    const a=new Map(before[table].map(r=>[identity(r,table),r]));
    const b=new Map(after[table].map(r=>[identity(r,table),r]));
    for (const id of new Set([...a.keys(),...b.keys()])) {
      const old=a.get(id),next=b.get(id);
      if (!old || !next) {
        assert(!base.has(table),'基础资料禁止增删');
        changes.push({table,id,kind:old?'delete':'insert',row:old||next});
      } else {
        const fields={};
        for (const key of Object.keys(old)) if (old[key]!==next[key]) fields[key]={before:old[key],after:next[key]};
        if (Object.keys(fields).length) changes.push({table,id,kind:'update',fields,pk:keys[table].map(k=>old[k])});
      }
    }
  }
  return changes;
}

async function snapshot(db,lock) {
  const state={};
  for(const [table,pk] of Object.entries(keys))
    [state[table]]=await db.query('SELECT * FROM ?? ORDER BY '+pk.map(()=> '??').join(', ')+(lock?' FOR UPDATE':''),[table,...pk]);
  return state;
}

async function persist(db,target,changes) {
  // Free occupied sequence numbers before inserting the new order.
  const memberships='t_meridian_atlas_points';
  const affected=new Set(changes.filter(c=>c.table===memberships).map(c=>Number(c.id.split('/')[0])));
  for(const id of affected) await db.query('DELETE FROM ?? WHERE meridian_id=?',[memberships,id]);
  for(const row of target[memberships]) if(affected.has(row.meridian_id)) await db.query('INSERT INTO ?? SET ?',[memberships,row]);
  for(const c of changes) {
    if(c.table===memberships) continue;
    const where=keys[c.table].map(k=>'?? = ?').join(' AND ');
    const keyValues=keys[c.table].flatMap((k,i)=>[k,c.row ? c.row[k]:c.pk[i]]);
    if(c.kind==='insert') await db.query('INSERT INTO ?? SET ?',[c.table,c.row]);
    else if(c.kind==='delete') await db.query('DELETE FROM ?? WHERE '+where,[c.table,...keyValues]);
    else await db.query('UPDATE ?? SET ? WHERE '+where,[c.table,Object.fromEntries(Object.entries(c.fields).map(([k,v])=>[k,v.after])),...keyValues]);
  }
}

async function main() {
  const [mode='--check',out,backupFile] = process.argv.slice(2);
  assert(['--apply','--check','--verify','--restore'].includes(mode) && out,'用法：--check|--apply|--verify|--restore 输出目录 [备份]');
  const {MYSQL_HOST:host,MYSQL_PORT:port,MYSQL_USERNAME:user,MYSQL_PASSWORD:password,MYSQL_DATABASE:database,MYSQL_ATTR_SSL_CA:ca} = process.env;
  assert(host && user && password && database && port,'请显式配置 MYSQL_HOST/PORT/USERNAME/PASSWORD/DATABASE');
  const local=['localhost','127.0.0.1','::1'].includes(host);
  const db=await mysql.createConnection({host,port:Number(port),user,password,database,charset:'utf8mb4',dateStrings:true,
    ...(!local || ca ? {ssl:{rejectUnauthorized:true,...(ca?{ca:fs.readFileSync(ca)}:{})}} : {})});
  let locked=false;
  const lockName='atlas.'+digest(database).slice(0,32);
  const write=mode==='--apply'||mode==='--restore';
  fs.mkdirSync(out,{recursive:true});
  const stem=path.join(out,Date.now()+'-'+mode.slice(2));
  try {
    const [engines]=await db.query('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?)',[database,Object.keys(keys)]);
    assert(engines.length===Object.keys(keys).length && engines.every(e=>e.ENGINE==='InnoDB'),'请先迁移表结构，五张表均需 InnoDB');
    if(write) {
      const [[{ok}]]=await db.query('SELECT GET_LOCK(?,10) AS ok',[lockName]);
      assert.equal(ok,1);locked=true;
    }
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.beginTransaction();
    const before=await snapshot(db,write);
    const beforeHash=digest(before);
    let target,coverage;
    if(mode==='--restore') {
      const backup=read(backupFile);
      assert.deepEqual(backup.target,{host,port,database});
      assert.equal(backup.afterHash,beforeHash,'导入后数据已变更，停止回滚');
      assert.equal(backup.beforeHash,digest(backup.before),'备份校验失败');
      target=backup.before;
    } else ({target,coverage}=plan(before));
    const changes=differences(before,target), afterHash=digest(target);
    const result={mode,beforeHash,afterHash,changedRows:changes.length,coverage};
    saveNew(stem+'-diff.json',{...result,changes});
    if(mode==='--verify') assert.equal(changes.length,0,'仍有待导入差异');
    if(write && changes.length) {
      result.backup=stem+'-backup.json';
      saveNew(result.backup,{target:{host,port,database},beforeHash,afterHash,before});
      await persist(db,target,changes);
      assert.equal(digest(await snapshot(db,false)),afterHash,'事务内完整性校验失败');
    }
    await db.commit();
    if(write) assert.equal(digest(await snapshot(db,false)),afterHash,'提交后校验失败');
    console.log(JSON.stringify({...result,coverage:coverage?.length}));
  } catch(error) {await db.rollback();throw error;}
  finally {if(locked) await db.query('SELECT RELEASE_LOCK(?)',[lockName]);await db.end();}
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});

