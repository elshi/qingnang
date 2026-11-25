import fs from 'node:fs/promises';
import path from 'node:path';
import {pinyin} from 'pinyin-pro';
import {DATA,BATCH,readJson,writeJson} from './common.mjs';
import {simplify} from './extract.mjs';
import {catalog as core} from './catalog.mjs';
if(BATCH!=='extra-300')throw new Error('Wrong batch');
const captured=await readJson(path.join(DATA,'candidate-capture.json'));
const screening=await readJson(path.join(DATA,'candidate-screening.json'));
if(captured.candidates.length!==599||screening.candidates.length!==599)throw new Error('Candidate screening is incomplete');
const quotas={'医经与医理':20,'诊断与脉学':20,'本草与炮制':30,'方剂与综合方书':25,'针灸与经络':20,'伤寒与金匮研究':25,'温病与疫病':15,'内科与杂病':20,'妇科与产科':20,'儿科':20,'外科与伤科':20,'眼科与耳鼻喉':15,'养生与食疗':10,'医案与医话':20,'综合医学':20};
const topics={'医经与医理':'医经注释、脏腑经络及传统医理','诊断与脉学':'脉象辨识、四诊方法与脉证关系','本草与炮制':'药物性味、主治、辨识与修治','方剂与综合方书':'病证分类、方药组成及传统用法','针灸与经络':'经络腧穴、针灸方法与病证取穴','伤寒与金匮研究':'仲景经文解释及伤寒杂病辨治','温病与疫病':'温热、时疫等外感病证的辨治','内科与杂病':'内伤杂病的辨证与方药','妇科与产科':'经带胎产及妇人病证的诊治','儿科':'小儿病证、诊法与方药','外科与伤科':'疮疡、损伤及相关外治与内治','眼科与耳鼻喉':'眼目或咽喉口齿病证的诊治','养生与食疗':'日常调养、食养及养老保健','医案与医话':'古代医家的诊疗记录与医学议论','综合医学':'多科病证、诊治方法与方药经验'};
const aliases={312:['金匮歌括'],444:['注释伤寒论','注解伤寒论'],513:['伤寒类方'],591:['霍乱论'],644:['红炉点雪'],770:['颅囟经'],860:['外科发挥'],1071:['回春录'],1208:['中藏经'],1256:['三因方']};
const authorOverrides={18:'题王冰',19:'题刘完素',86:'题朱震亨',138:'苏敬、李勣等',185:'张志聪；高世栻续成',228:'题孙思邈（一说宋钱竽）',312:'陈念祖；陈蔚订；陈元犀注',445:'张仲景；成无己注；张遂辰参',603:'旧题朱震亨',607:'虞抟',903:'旧题孙思邈',897:'黄庭镜；邓学礼刊',988:'吴瑭',1208:'旧题华佗'};
const excluded=new Set([34,150,165,482,553,764,815,1008,1078,1222]); // Ambiguous editorial layer, incomplete source, or possible work overlap.
const eligible=screening.candidates.filter(c=>!c.reasons.length&&!excluded.has(c.id));
const selected=[];
for(const [category,count]of Object.entries(quotas))selected.push(...eligible.filter(c=>c.category===category).slice(0,count));
const already=new Set(selected.map(c=>c.id));
// Fill shortages across categories, preserving source-index order and uniqueness.
for(const c of eligible){if(selected.length>=300)break;if(!already.has(c.id)){selected.push(c);already.add(c.id);}}
if(selected.length!==300)throw new Error(`Only ${selected.length} eligible works`);
// The source labels Zhang Ji's book as Qing, but its preface and library records
// date the work to the twentieth century. Keep the rest of the selected list.
const replacement=eligible.find(c=>c.id===312);
const misdatedIndex=selected.findIndex(c=>c.id===46);
if(misdatedIndex===-1||!replacement||already.has(312))throw new Error('Unexpected selection for the bibliographic correction');
selected.splice(misdatedIndex,1,replacement);
already.delete(46);
already.add(312);
selected.sort((a,b)=>a.id-b.id);
const catalogue=selected.map(c=>{
  const author=authorOverrides[c.id]||simplify(c.metadata['作者']).replaceAll('黄玉璐','黄元御').replaceAll('吴崐','吴昆');
  if([...author].length>20)throw new Error(`Author needs editorial shortening: ${c.id} ${author}`);
  const name=simplify(c.title);
  const headings=c.first_titles.filter(t=>!/[序跋]|凡例|目录|卷首|题词|题辞|引言|原刊|撰人|书后/.test(t)).slice(0,3);
  const subject=headings.length?`所收卷篇包括${headings.map(t=>'“'+t+'”').join('、')}等。`:'';
  return {key:`extra_${c.id}`,name,sourceTitle:c.title,category:c.category,dynasty:simplify(c.metadata['朝代']),author,jp:pinyin(name,{pattern:'first',toneType:'none',type:'array'}).join('').replace(/[^a-z]/gi,'').toUpperCase(),summary:`《${name}》属于${c.category}文献，内容涉及${topics[c.category]}。${subject}本次依据所列电子底本整理，保存卷篇次序及可辨识的古注。`,aliases:[...new Set([...(aliases[c.id]||[]),c.title])].filter(a=>a!==name),candidate_id:c.id};
});
for(const c of catalogue){if(core.some(b=>b.name===c.name||b.sourceTitle===c.sourceTitle||b.aliases.includes(c.name)))throw new Error('Core overlap: '+c.name);}
await fs.writeFile(new URL('./catalog-extra-300.json',import.meta.url),JSON.stringify(catalogue,null,2)+'\n');
await writeJson(path.join(DATA,'capture-report.json'),{generated_at:new Date().toISOString(),index:captured.index,license:captured.license,books:catalogue.map(b=>({key:b.key,name:b.name,parts:[captured.candidates.find(c=>c.id===b.candidate_id)]}))});
await writeJson(path.join(DATA,'selection-report.json'),{generated_at:new Date().toISOString(),target:'300 additional works excluding core 50; existing database books are reused/skipped',selected_ids:catalogue.map(b=>b.candidate_id),deferred:screening.candidates.filter(c=>!already.has(c.id)).map(c=>({id:c.id,title:c.title,reasons:c.id===46?['source_era_corrected_to_republican_period']:excluded.has(c.id)?['deferred_after_source_review']:c.reasons.length?c.reasons:['not_selected_in_this_batch']}))});
console.log(JSON.stringify({selected:catalogue.length,categories:Object.fromEntries(Object.keys(quotas).map(category=>[category,catalogue.filter(b=>b.category===category).length]))},null,2));
