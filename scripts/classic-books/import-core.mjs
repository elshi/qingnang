import {sha256} from './common.mjs';

const ident=s=>{if(!/^[a-zA-Z0-9_]+$/.test(s))throw new Error('Unsafe identifier');return `\`${s}\``;};
const equalText=(a,b)=>String(a??'').replace(/\r\n?/g,'\n').trim()===String(b??'').replace(/\r\n?/g,'\n').trim();
export function assertDataset(dataset){
  const {book,chapters}=dataset;
  if(!book||!Array.isArray(chapters)||!chapters.length)throw new Error('Empty or invalid dataset');
  for(const key of ['key','name','summary','dynasty','author','jp'])if(typeof book[key]!=='string'||!book[key].trim())throw new Error(`Missing book field ${key}`);
  if(!Array.isArray(book.aliases)||book.aliases.some(a=>typeof a!=='string'||!a.trim()))throw new Error('Invalid aliases');
  const keys=new Set();
  for(const [i,c] of chapters.entries()){
    if(c.order!==i+1||!c.chapter_key||keys.has(c.chapter_key)||!c.title||!c.content||c.shiyi!==null)throw new Error(`Invalid chapter at ${i+1}`);
    if(c.volume!==null&&typeof c.volume!=='string')throw new Error('Invalid volume');
    if(sha256(c.content)!==c.content_sha256)throw new Error(`Content checksum mismatch at ${i+1}`);
    if(/[\uFFFD\u0000]/u.test(c.content))throw new Error(`Invalid character at ${i+1}`);
    if(/<(?:div|span|script|html|body|br)\b/i.test(c.content))throw new Error(`HTML in chapter ${i+1}`);
    keys.add(c.chapter_key);
  }
}

export async function inspectSchema(db,database){
  ident(database);
  const [rows]=await db.execute('SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,CHARACTER_MAXIMUM_LENGTH,CHARACTER_OCTET_LENGTH,CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?,?) ORDER BY ORDINAL_POSITION',[database,'t_books','t_book_chapters']);
  const [engines]=await db.execute('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?,?)',[database,'t_books','t_book_chapters']);
  if(engines.length!==2||engines.some(t=>t.ENGINE!=='InnoDB'))throw new Error('Both existing tables must use InnoDB; no schema changes are performed');
  const books=new Map(rows.filter(r=>r.TABLE_NAME==='t_books').map(r=>[r.COLUMN_NAME,r]));
  const chapters=new Map(rows.filter(r=>r.TABLE_NAME==='t_book_chapters').map(r=>[r.COLUMN_NAME,r]));
  const choose=(map,keys,required=true)=>{const field=keys.find(k=>map.has(k));if(!field&&required)throw new Error(`Missing field: ${keys.join('/')}`);return field||null;};
  for(const field of ['id','name','summary','dynasty','author'])choose(books,[field]);
  const bookFields={jp:choose(books,['jp','abbreviation'])};
  const fields={id:choose(chapters,['id','chapter_id','chapterid']),book_id:choose(chapters,['book_id','bookid','books_id','bookId','bid']),title:choose(chapters,['title','name','chapter_title','chapter_name','chapter']),content:choose(chapters,['content','chapter_content','chapter_text','text','body','original']),volume:choose(chapters,['volume'],false),shiyi:choose(chapters,['shiyi'],false),order:choose(chapters,['item_order'],false)};
  const [indexes]=await db.execute('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?,?)',[database,'t_books','t_book_chapters']);
  const manualIds={};
  for(const [map,id] of [[books,'id'],[chapters,fields.id]]){
    const column=map.get(id),tableName=column.TABLE_NAME;
    checkValue(column,1);
    const unique=indexes.filter(r=>r.TABLE_NAME===tableName&&Number(r.NON_UNIQUE)===0);
    if(!unique.some(r=>r.COLUMN_NAME===id&&unique.filter(s=>s.INDEX_NAME===r.INDEX_NAME).length===1))throw new Error(`${tableName}.${id} requires a single-column unique index`);
    manualIds[tableName]=!column.EXTRA.includes('auto_increment');
  }
  const suppliedBooks=new Set(['id','name','summary','dynasty','author',bookFields.jp]);
  const suppliedChapters=new Set(Object.entries(fields).filter(([k,v])=>v&&k!=='id').map(([,v])=>v));
  suppliedChapters.add(fields.id);
  for(const [map,supplied] of [[books,suppliedBooks],[chapters,suppliedChapters]])for(const c of map.values()){
    if(!supplied.has(c.COLUMN_NAME)&&c.IS_NULLABLE==='NO'&&c.COLUMN_DEFAULT===null&&!/auto_increment|GENERATED/.test(c.EXTRA))throw new Error(`Unmapped required column ${c.TABLE_NAME}.${c.COLUMN_NAME}`);
  }
  return {database,books,chapters,fields,bookFields,manualIds};
}

function checkValue(column,value){
  if(value===null){if(column.IS_NULLABLE!=='YES')throw new Error(`NULL not allowed: ${column.TABLE_NAME}.${column.COLUMN_NAME}`);return;}
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid numeric value for ${column.COLUMN_NAME}`);
    const limits={tinyint:127,smallint:32767,mediumint:8388607,int:2147483647,bigint:Number.MAX_SAFE_INTEGER};
    const max=limits[column.DATA_TYPE];
    if(!max)throw new Error(`Numeric field has unsupported type: ${column.COLUMN_NAME}`);
    const unsigned=column.COLUMN_TYPE.includes('unsigned');
    if(value>(unsigned&&column.DATA_TYPE!=='bigint'?max*2+1:max))throw new Error(`Number exceeds ${column.COLUMN_NAME}`);
    return;
  }
  const text=String(value);
  if(!['char','varchar','tinytext','text','mediumtext','longtext'].includes(column.DATA_TYPE))throw new Error(`Unsupported text column ${column.COLUMN_NAME}`);
  if(!['utf8mb4','utf8mb3','utf8'].includes(column.CHARACTER_SET_NAME))throw new Error(`Unsupported charset for ${column.COLUMN_NAME}: ${column.CHARACTER_SET_NAME}`);
  if(column.CHARACTER_SET_NAME!=='utf8mb4'&&[...text].some(c=>c.codePointAt(0)>65535))throw new Error(`${column.COLUMN_NAME} requires utf8mb4 for supplementary characters`);
  if(column.CHARACTER_MAXIMUM_LENGTH!==null&&[...text].length>Number(column.CHARACTER_MAXIMUM_LENGTH))throw new Error(`Character length exceeds ${column.TABLE_NAME}.${column.COLUMN_NAME}`);
  if(column.CHARACTER_OCTET_LENGTH!==null&&Buffer.byteLength(text)>Number(column.CHARACTER_OCTET_LENGTH))throw new Error(`Byte length exceeds ${column.TABLE_NAME}.${column.COLUMN_NAME}`);
}
function emptyValue(col){return col.IS_NULLABLE==='YES'?null:'';}
function chapterValues(c,bookId,schema){
  const f=schema.fields,values={[f.book_id]:bookId,[f.title]:c.title,[f.content]:c.content};
  if(f.volume)values[f.volume]=c.volume??emptyValue(schema.chapters.get(f.volume));
  if(f.shiyi)values[f.shiyi]=emptyValue(schema.chapters.get(f.shiyi));
  if(f.order)values[f.order]=c.order;
  return values;
}
const bookValues=(b,schema)=>({...Object.fromEntries(['name','summary','dynasty','author'].map(k=>[k,b[k]])),[schema.bookFields.jp]:b.jp});
function table(schema,name){return `${ident(schema.database)}.${ident(name)}`;}

export async function planBook(db,schema,dataset,{lock=false}={}){
  assertDataset(dataset);
  const {book,chapters}=dataset,f=schema.fields;
  const names=[...new Set([book.name,...book.aliases])];
  const [matches]=await db.execute(`SELECT * FROM ${table(schema,'t_books')} WHERE name IN (${names.map(()=>'?').join(',')}) ORDER BY id${lock?' FOR UPDATE':''}`,names);
  const result={key:book.key,name:book.name,existing_book:matches.length===1,book_id:matches.length===1?Number(matches[0].id):null,action:matches.length===0?'insert':'reuse',existing_chapters:0,chapters_to_insert:[],conflicts:[]};
  if(matches.length>1){result.action='conflict';result.conflicts.push('multiple_matching_books');return result;}
  // Existing book metadata is deliberately neither checked for equality nor updated.
  if(!matches.length)for(const [k,v]of Object.entries(bookValues(book,schema)))checkValue(schema.books.get(k),v);
  let stored=[];
  if(matches.length){[stored]=await db.execute(`SELECT * FROM ${table(schema,'t_book_chapters')} WHERE ${ident(f.book_id)}=? ORDER BY ${ident(f.id)}${lock?' FOR UPDATE':''}`,[result.book_id]);}
  result.existing_chapters=stored.length;
  if(matches.length)result.existing_metadata_sha256=sha256(JSON.stringify(matches[0]));
  if(stored.length>chapters.length)result.conflicts.push('existing_chapters_exceed_source');
  // The public API orders by id. Only an identical ordered prefix can be safely
  // extended without rewriting IDs or changing that API. A missing middle is a
  // conflict even when an item_order column happens to exist.
  for(let i=0;i<stored.length&&i<chapters.length;i++){
    const old=stored[i],want=chapters[i];
    if(!equalText(old[f.title],want.title)||(f.volume&&!equalText(old[f.volume],want.volume))||(f.order&&Number(old[f.order])!==want.order))result.conflicts.push(`chapter_identity_or_order:${i+1}`);
    else if(!equalText(old[f.content],want.content))result.conflicts.push(`chapter_content:${i+1}`);
  }
  if(!result.conflicts.length){
    result.chapters_to_insert=chapters.slice(stored.length);
    for(const ch of result.chapters_to_insert)for(const [key,value]of Object.entries(chapterValues(ch,result.book_id??1,schema)))checkValue(schema.chapters.get(key),value);
  }else result.action='conflict';
  return result;
}
async function insertRows(db,schema,tableName,rows,idState){
  const target=table(schema,tableName);
  let firstExplicitId;
  if(schema.manualIds[tableName]){
    const id=tableName==='t_books'?'id':schema.fields.id;
    const columns=tableName==='t_books'?schema.books:schema.chapters;
    if(idState[tableName]===undefined){
      const [rows]=await db.query(`SELECT ${ident(id)} AS last_id FROM ${target} ORDER BY ${ident(id)} DESC LIMIT 1 FOR UPDATE`);
      idState[tableName]=rows.length?Number(rows[0].last_id):0;
    }
    firstExplicitId=idState[tableName]+1;
    rows=rows.map(values=>{
      const explicitId=++idState[tableName];
      checkValue(columns.get(id),explicitId);
      return {...values,[id]:explicitId};
    });
  }
  const keys=Object.keys(rows[0]);
  const placeholder=`(${keys.map(()=>'?').join(',')})`;
  const [result]=await db.execute(`INSERT INTO ${target} (${keys.map(ident).join(',')}) VALUES ${rows.map(()=>placeholder).join(',')}`,rows.flatMap(values=>keys.map(k=>values[k])));
  if(result.affectedRows!==rows.length)throw new Error('Insert count mismatch');
  return firstExplicitId??Number(result.insertId);
}
async function insertRow(db,schema,tableName,values,idState){return insertRows(db,schema,tableName,[values],idState);}
function publicResult(plan){const {chapters_to_insert,...rest}=plan;return {...rest,planned_chapters:chapters_to_insert.length,inserted_books:0,inserted_chapters:0,committed:false};}

export async function importDatasets(db,database,datasets,{apply=false,beforeChapterInsert=null,chapterBatchSize=1}={}){
  if(!Number.isInteger(chapterBatchSize)||chapterBatchSize<1||chapterBatchSize>100)throw new Error('Chapter batch size must be 1–100');
  const schema=await inspectSchema(db,database);
  const report={mode:apply?'apply':'preflight',database,started_at:new Date().toISOString(),books:[]};
  const lockName=`qingnang.classic-books.${database}`;
  let locked=false;
  try{
    if(apply){const [[r]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[lockName]);if(Number(r.acquired)!==1)throw new Error('Another classic-books import is running');locked=true;}
    for(const dataset of datasets){
      let result;
      try{
        if(apply)await db.beginTransaction();else await db.query('START TRANSACTION READ ONLY');
        const plan=await planBook(db,schema,dataset,{lock:apply});result=publicResult(plan);
        if(!apply||plan.conflicts.length){await db.rollback();report.books.push(result);continue;}
        let bookId=plan.book_id;
        const idState={};
        if(!plan.existing_book){bookId=await insertRow(db,schema,'t_books',bookValues(dataset.book,schema),idState);result.inserted_books=1;}
        let chapterRows=[],chapterBytes=0;
        async function flushChapters(){
          if(!chapterRows.length)return;
          await insertRows(db,schema,'t_book_chapters',chapterRows,idState);
          result.inserted_chapters+=chapterRows.length;
          chapterRows=[];
          chapterBytes=0;
        }
        for(const chapter of plan.chapters_to_insert){
          if(beforeChapterInsert)await beforeChapterInsert(chapter);
          const values=chapterValues(chapter,bookId,schema);
          for(const [key,value]of Object.entries(values))checkValue(schema.chapters.get(key),value);
          const rowBytes=Object.values(values).reduce((sum,value)=>sum+(typeof value==='string'?Buffer.byteLength(value):8),32);
          if(chapterBytes+rowBytes>512*1024)await flushChapters();
          chapterRows.push(values);
          chapterBytes+=rowBytes;
          if(chapterRows.length===chapterBatchSize)await flushChapters();
        }
        await flushChapters();
        // Verify actual inserted text and association before commit (truncation,
        // charset coercion, triggers and accidental ID mapping are caught here).
        const after=await planBook(db,schema,dataset,{lock:true});
        if(after.conflicts.length||after.chapters_to_insert.length||after.book_id!==bookId)throw new Error('Post-insert verification failed');
        if(plan.existing_book&&plan.existing_metadata_sha256!==after.existing_metadata_sha256)throw new Error('Existing book metadata changed during insertion; rolling back');
        await db.commit();result.book_id=bookId;result.committed=true;
        report.books.push(result);
      }catch(e){
        await db.rollback();
        report.books.push({...result,key:dataset.book?.key,name:dataset.book?.name,action:'error',inserted_books:0,inserted_chapters:0,committed:false,error:e.code||e.message});
      }
    }
  }finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lockName]);}
  report.finished_at=new Date().toISOString();
  report.summary={existing_books:report.books.filter(b=>b.existing_book).length,planned_new_books:report.books.filter(b=>b.action==='insert').length,inserted_books:report.books.reduce((s,b)=>s+(b.inserted_books||0),0),planned_chapters:report.books.reduce((s,b)=>s+(b.planned_chapters||0),0),inserted_chapters:report.books.reduce((s,b)=>s+(b.inserted_chapters||0),0),conflicts:report.books.filter(b=>b.conflicts?.length).length,errors:report.books.filter(b=>b.error).length};
  return report;
}
