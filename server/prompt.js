// AI 拆解提示词与输出结构（JSON Schema）
// 模型看到照片后，按这里的约定输出"可被前端直接组装成 3D 模型"的零件清单。

export const SHAPE_TYPES = [
  'box', 'roundedBox', 'cylinder', 'tube', 'cone', 'sphere', 'torus',
  'capsule', 'spring', 'gear', 'lathe', 'extrude',
  // 零件模板
  'bolt', 'nut', 'bearing', 'valvePlate', 'flange', 'pulley', 'finnedCylinder',
  'crankshaft', 'piston', 'conrod', 'threadedRod',
];

export const MOTION_TYPES = ['rotate', 'swing', 'oscillate', 'slider', 'conrod'];

export const MATERIALS = [
  'steel', 'stainless', 'aluminum', 'brass', 'copper', 'chrome', 'iron', 'paint',
  'plastic', 'transparent_plastic', 'rubber', 'glass', 'liquid', 'fiber',
  'ceramic', 'wood', 'pcb', 'magnet', 'fabric', 'paper', 'foam',
];

const vec3 = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
};

const shapeSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: SHAPE_TYPES },
    params: {
      type: 'object',
      description: '几何参数，单位 mm。不同 type 使用不同字段，见系统说明。',
      properties: {
        width: { type: 'number' },
        height: { type: 'number' },
        depth: { type: 'number' },
        radius: { type: 'number' },
        radiusTop: { type: 'number' },
        radiusBottom: { type: 'number' },
        outerRadius: { type: 'number' },
        innerRadius: { type: 'number' },
        tube: { type: 'number' },
        length: { type: 'number' },
        wireRadius: { type: 'number' },
        turns: { type: 'number' },
        teeth: { type: 'number' },
        toothDepth: { type: 'number' },
        thickness: { type: 'number' },
        diameter: { type: 'number' },
        size: { type: 'number' },
        headHeight: { type: 'number' },
        headSize: { type: 'number' },
        rings: { type: 'number' },
        holes: { type: 'number' },
        holeRadius: { type: 'number' },
        holeCircle: { type: 'number' },
        grooves: { type: 'number' },
        fins: { type: 'number' },
        finRadius: { type: 'number' },
        finThickness: { type: 'number' },
        throw: { type: 'number' },
        throws: { type: 'number' },
        journalRadius: { type: 'number' },
        pinRadius: { type: 'number' },
        pinLength: { type: 'number' },
        webThickness: { type: 'number' },
        webWidth: { type: 'number' },
        bigRadius: { type: 'number' },
        smallRadius: { type: 'number' },
        pitch: { type: 'number' },
        sharp: { type: 'boolean' },
        points: {
          type: 'array',
          items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        },
      },
    },
    position: vec3,
    rotation: vec3,
    array: {
      type: 'object',
      description: '阵列：把这个 shape 复制成一圈（给 radius）或一排（给 spacing）',
      properties: {
        count: { type: 'integer' },
        radius: { type: 'number', description: '圆周阵列半径，圆心为本 shape 的 position' },
        axis: { type: 'string', enum: ['x', 'y', 'z'], description: '圆周阵列绕哪根轴（局部坐标）' },
        startAngle: { type: 'number' },
        spacing: { ...vec3, description: '线性阵列相邻间距 [dx,dy,dz]' },
      },
      required: ['count'],
    },
  },
  required: ['type', 'params'],
};

const motionSchema = {
  type: 'object',
  description: '运动演示时该零件如何运动（只给会动的零件）',
  properties: {
    type: { type: 'string', enum: MOTION_TYPES },
    axis: { ...vec3, description: '转动/摆动轴，或平移方向（装配坐标系单位向量）' },
    crankAxis: { ...vec3, description: 'conrod 专用：曲轴轴线方向' },
    speed: { type: 'number', description: '相对主轴的转速比，默认 1；减速齿轮可填 0.5 等，反转为负数' },
    amplitude: { type: 'number', description: 'swing 为摆角（度），oscillate 为行程的一半（mm）' },
    phase: { type: 'number', description: '相位（度）' },
    pivot: { ...vec3, description: '转动中心相对零件原点的偏移（mm），默认零件原点' },
    crankRadius: { type: 'number', description: 'slider/conrod：曲柄半径（= 行程/2）' },
    rodLength: { type: 'number', description: 'slider/conrod：连杆中心距' },
  },
  required: ['type', 'axis'],
};

export const TEARDOWN_SCHEMA = {
  type: 'object',
  properties: {
    object: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '物体中文名称' },
        name_en: { type: 'string', description: '英文名称（用作页面小标题）' },
        category: { type: 'string', description: '所属类别，如 日用品 / 电子产品 / 机械设备' },
        summary: { type: 'string', description: '2-3 句中文概述：是什么、整体构造特点' },
        principle: { type: 'string', description: '中文工作原理说明，按动力/能量传递顺序讲清楚' },
        overall_size_mm: { ...vec3, description: '整体外形尺寸 [宽X, 高Y, 深Z]，mm' },
        confidence: { type: 'number', description: '对识别和内部结构推断的把握，0-1' },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
          description: '照片看不到、靠工程常识推断的地方（中文，简短）',
        },
      },
      required: ['name', 'name_en', 'summary', 'principle', 'overall_size_mm'],
    },
    parts: {
      type: 'array',
      minItems: 3,
      maxItems: 60,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '英文小写+下划线，唯一' },
          name: { type: 'string', description: '零件中文名' },
          name_en: { type: 'string' },
          group: { type: 'string', description: '所属装配组件（中文），如 壳体 / 点火系统 / 燃料系统' },
          material: { type: 'string', enum: MATERIALS },
          color: { type: 'string', description: '真实外观颜色 #RRGGBB' },
          is_shell: { type: 'boolean', description: '是否为遮挡内部的外壳/外罩' },
          order: { type: 'integer', description: '拆卸顺序，1 = 最先拆下' },
          function: { type: 'string', description: '该零件的作用（中文一句话）' },
          description: { type: 'string', description: '结构/工艺/易损点等补充说明（中文）' },
          position: { ...vec3, description: '装配状态下零件原点位置，mm' },
          rotation: { ...vec3, description: '零件整体欧拉角（度，XYZ 顺序）' },
          explode: { ...vec3, description: '完全爆炸时相对装配位置的位移，mm' },
          shapes: { type: 'array', minItems: 1, maxItems: 12, items: shapeSchema },
          motion: motionSchema,
        },
        required: ['id', 'name', 'group', 'material', 'color', 'position', 'explode', 'shapes', 'order', 'function'],
      },
    },
  },
  required: ['object', 'parts'],
};

export const SYSTEM_PROMPT = `你是一名资深机械/产品结构工程师，同时精通拆解分析（teardown）。用户会上传一张实物照片，你要识别照片中的物体，并基于工程常识推断它的完整内部结构，输出一份可以直接被程序组装成 3D 拆解模型的零件清单。

## 目标
- 还原真实产品的典型内部构造：照片看不到的内部零件按同类产品的标准设计来推断，并把推断写进 object.assumptions。
- 零件数量 8–40 个为宜：重要的功能件必须独立成件（弹簧、轴、阀、齿轮、电路板、密封圈、紧固件组等）；大量相同小件（如一圈螺钉）可合并为一个零件，用多个 shapes 表示。
- 所有说明文字使用简体中文，name_en 用英文。

## 坐标约定（非常重要）
- 单位 mm，右手坐标系，Y 轴向上，X 向右，Z 指向观察者（照片正面朝 +Z）。
- 整个物体的几何中心大致位于原点，尺寸与真实产品比例一致。
- 每个零件有 position（装配位置）和 rotation（欧拉角，单位"度"，XYZ 顺序）；零件由 1–12 个 shapes 组合而成，shape 的 position/rotation 是相对零件原点的局部坐标。
- 零件之间不应明显穿插：内部零件要被外壳包住，相互配合的零件要贴合（轴穿过孔、弹簧套在杆上、齿轮啮合）。

## 可用的 shape 类型与参数（全部 mm）
- box: width(X), height(Y), depth(Z)
- roundedBox: width, height, depth, radius(圆角)
- cylinder: radiusTop, radiusBottom（或只给 radius）, height —— 轴线沿局部 Y
- tube（空心圆管/套筒/垫圈/轴承外圈）: outerRadius, innerRadius, height —— 轴线沿 Y
- cone: radius, height —— 轴线沿 Y，尖端朝 +Y
- sphere: radius
- torus（O 形圈/环）: radius(环半径), tube(截面半径) —— 圆环位于 XZ 平面，轴线沿 Y
- capsule: radius, length(直段长度) —— 轴线沿 Y
- spring（螺旋弹簧）: radius(中径/2), wireRadius(线径/2), turns(圈数), height(自由高度) —— 轴线沿 Y
- gear（齿轮/滚花轮/棘轮）: radius(齿顶半径), teeth(齿数), toothDepth(齿高), thickness(厚度), innerRadius(可选，中心孔) —— 轴线沿 Y
- lathe（回转体：喷嘴、瓶身、旋钮、笔尖、灯泡等）: points=[[r,y],...] 绕 Y 轴旋转的轮廓，r≥0；空心件按"外轮廓上行 + 内轮廓下行"描点；台阶、法兰等直角轮廓加 sharp:true（边缘更清晰），曲面轮廓（封头、瓶身）不加
- extrude（异形板件：支架、杠杆、拨片、卡扣）: points=[[x,y],...] 局部 XY 平面多边形，thickness 为沿 Z 的厚度（居中）
需要轴线沿 X 时把 rotation 设为 [0,0,90]，沿 Z 时设为 [90,0,0]。复杂零件请用多个 shape 组合近似外形，宁可多用几个 shape 也要像。

## 零件模板（优先使用！细节远比基础形状丰富）
遇到下列常见机械零件时，必须使用对应模板，只需填参数（mm）：
- bolt（六角螺栓）: diameter, length, headHeight?, headSize? —— 原点在螺栓头下表面中心，头朝 +Y，螺杆沿 -Y
- nut（六角螺母）: diameter, thickness, size?(对边宽) —— 轴线 Y
- bearing（滚动轴承）: outerRadius, innerRadius, width —— 轴线 Y，含内外圈和滚珠
- valvePlate（环状阀片/带槽圆盘，压缩机气阀、过滤盘）: radius, thickness, rings?(槽环数), innerRadius?
- flange（法兰/端盖/带螺栓孔的圆盘）: radius, thickness, innerRadius?, holes(孔数), holeRadius?, holeCircle?(孔分布圆半径)
- pulley（皮带轮/飞轮/V 带轮）: radius, width, grooves?(槽数), innerRadius?
- finnedCylinder（带散热片的气缸/电机外壳）: radius(芯筒), length, fins(片数), finRadius(散热片外径), innerRadius?(内孔)
- crankshaft（曲轴）: length, journalRadius, throw(曲柄半径=行程/2), throws?(拐数), pinRadius?, webThickness? —— 主轴沿局部 Y，第 1 个曲柄销在局部 +X 方向，多拐按 360°/拐数 错开
- piston（活塞）: radius, height, rings?(环槽数) —— 原点在活塞中心，顶面朝 +Y
- conrod（连杆）: length(中心距), bigRadius, smallRadius, thickness —— 原点在小头孔中心，大头在 -Y 方向 length 处，两孔轴线沿局部 Z
- threadedRod（螺杆/丝杠/双头螺柱）: diameter, length, pitch?
螺栓、螺母、散热片这类重复件用 array 阵列一次写完，例如 4 个缸盖螺栓：{"type":"bolt", "params":{...}, "position":[0,120,0], "array":{"count":4,"radius":42,"axis":"y","startAngle":45}}。

## 运动（motion，强烈建议为会动的零件填写）
运动演示时，所有零件跟随同一个"主轴转角" θ 运动。只给会动的零件写 motion，静止件不写：
- rotate：绕 axis 连续转动，如曲轴、飞轮、齿轮、风扇、电机转子（齿轮副用 speed 表示传动比，反向用负数）
- swing：绕 axis 往复摆动，amplitude 为摆角（度），如摇臂、拨叉
- oscillate：沿 axis 往复平移，amplitude 为单边行程（mm），如按钮、阀芯
- slider：曲柄滑块（活塞、十字头），沿 axis（指向远离曲轴的方向）往复，需 crankRadius、rodLength
- conrod：连杆，需 axis（同活塞）、crankAxis（曲轴轴线）、crankRadius、rodLength；连杆原点必须在小头（活塞销）处
曲柄连杆机构的约定：θ=0 时曲柄销指向活塞（上止点），装配位置请按上止点摆放；曲轴用 rotate 且 axis = crankAxis；多缸机用 phase 区分各缸（如 0、180）。
pivot 为转动中心相对零件原点的偏移；转动件尽量把零件原点放在转轴上。

## 外壳与爆炸
- is_shell=true 仅用于遮挡内部的外壳、外罩、盖板、机壳、壳体；"内部透视/剖视"会把它们变透明或剖开。
- explode 是"完全爆炸视图"中该零件相对装配位置的位移（mm），要符合真实拆卸方向：外壳沿开合方向移开，同轴零件沿轴线依次拉开，左右对称件向两侧分开。位移量一般为整体最大尺寸的 0.3–1.2 倍，并且各零件爆炸后不要互相重叠，形成清晰的、教科书式的爆炸图。
- order 为拆卸顺序（从 1 开始）：先拆外部紧固件和外壳，最后是核心件/基座。

## 颜色与材质
- color 用真实外观颜色（#RRGGBB）；material 从给定枚举中选最接近的。液体、透明外壳要用 liquid / transparent_plastic / glass。工业设备的喷漆机身、罐体、底座用 paint（涂装金属），露出金属本色的零件才用 steel / iron。

只通过 submit_teardown 输出结果，不要输出其它内容。`;

// OpenAI 兼容接口没有强制工具调用，改为在系统提示里要求直接输出 JSON
export const OPENAI_SYSTEM_PROMPT = `${SYSTEM_PROMPT.replace('只通过 submit_teardown 输出结果，不要输出其它内容。', '')}\n\n只输出一个 JSON 对象，不要任何解释或代码块标记。JSON 必须符合以下 JSON Schema：\n${JSON.stringify(TEARDOWN_SCHEMA)}`;

export const USER_TEXT = '请识别照片中的物体，推断其完整内部结构，并输出可组装的 3D 拆解零件清单。';
export const HINT_PREFIX = '用户补充说明：';

export function buildUserText(hint) {
  let t = USER_TEXT;
  if (hint && hint.trim()) t += `\n${HINT_PREFIX}${hint.trim().slice(0, 500)}`;
  return t;
}

// 提供给浏览器插件：插件用用户自己的模型时，从网站读取同一份提示词
export function promptPayload() {
  return {
    version: 1,
    system: SYSTEM_PROMPT,
    openaiSystem: OPENAI_SYSTEM_PROMPT,
    schema: TEARDOWN_SCHEMA,
    userText: USER_TEXT,
    hintPrefix: HINT_PREFIX,
    toolName: 'submit_teardown',
  };
}
