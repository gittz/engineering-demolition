// AI 拆解提示词与输出结构（JSON Schema）
// 模型看到照片后，按这里的约定输出"可被前端直接组装成 3D 模型"的零件清单。

export const SHAPE_TYPES = [
  'box', 'roundedBox', 'cylinder', 'tube', 'cone', 'sphere', 'torus',
  'capsule', 'spring', 'gear', 'lathe', 'extrude',
];

export const MATERIALS = [
  'steel', 'stainless', 'aluminum', 'brass', 'copper', 'chrome', 'iron',
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
        points: {
          type: 'array',
          items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        },
      },
    },
    position: vec3,
    rotation: vec3,
  },
  required: ['type', 'params'],
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
- lathe（回转体：喷嘴、瓶身、旋钮、笔尖、灯泡等）: points=[[r,y],...] 绕 Y 轴旋转的轮廓，r≥0；空心件按"外轮廓上行 + 内轮廓下行"描点
- extrude（异形板件：支架、杠杆、拨片、卡扣）: points=[[x,y],...] 局部 XY 平面多边形，thickness 为沿 Z 的厚度（居中）
需要轴线沿 X 时把 rotation 设为 [0,0,90]，沿 Z 时设为 [90,0,0]。复杂零件请用多个 shape 组合近似外形，宁可多用几个 shape 也要像。

## 外壳与爆炸
- is_shell=true 仅用于遮挡内部的外壳、外罩、盖板、机壳、壳体；"内部透视/剖视"会把它们变透明或剖开。
- explode 是"完全爆炸视图"中该零件相对装配位置的位移（mm），要符合真实拆卸方向：外壳沿开合方向移开，同轴零件沿轴线依次拉开，左右对称件向两侧分开。位移量一般为整体最大尺寸的 0.3–1.2 倍，并且各零件爆炸后不要互相重叠，形成清晰的、教科书式的爆炸图。
- order 为拆卸顺序（从 1 开始）：先拆外部紧固件和外壳，最后是核心件/基座。

## 颜色与材质
- color 用真实外观颜色（#RRGGBB）；material 从给定枚举中选最接近的。液体、透明外壳要用 liquid / transparent_plastic / glass。

只通过 submit_teardown 输出结果，不要输出其它内容。`;

export function buildUserText(hint) {
  let t = '请识别照片中的物体，推断其完整内部结构，并输出可组装的 3D 拆解零件清单。';
  if (hint && hint.trim()) t += `\n用户补充说明：${hint.trim().slice(0, 500)}`;
  return t;
}
