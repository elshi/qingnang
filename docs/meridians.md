# 经络首页

经络页分为“十二正经”和“奇经八脉”。顶部按分类切换两张静态 2D 人体经络示意图，每条经络的文字标注直接位于人像两侧。点击标注后，下方只展示当前经络的所属穴位或交会穴，每行 5 列；“查看详情”进入该经络详情页。页面不再展示图下方的名称列表和重复的“经脉选择”区。

普通经脉、任脉和督脉共 361 个标准穴名，按经穴顺序维护在 `miniprogram/utils/meridians.js`。其余六脉以“交会穴”标示，避免误称为本脉独立所属穴位。左右同名穴位只列一次。图上的线路用于教学总览，不能代替临床穴位定位。

资料来源：[WHO *A Proposed Standard International Acupuncture Nomenclature*](https://apps.who.int/iris/bitstream/handle/10665/40001/9241544171_eng.pdf)；[甘肃中医药大学附属医院《奇经八脉》](https://www.zyxyfy.com/zywh/zyzs/qjbm/content_2968)。

图片位于 `miniprogram/assets/meridians/`，由选定的首页设计图生成，保留自然肤色、双臂展开及双腿自然分开的姿态。静态图片与穴位名称分开维护，因此可修订名称而不必重绘图片。

验证：`node --test tests/miniprogram/meridians.test.cjs`。小程序模拟器检查两个 Tab、图上标注选择、五列表格和详情返回。
