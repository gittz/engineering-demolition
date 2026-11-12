// 发动机采用默认设备库的数据协议；几何由与独立演示共用的程序生成。
export const ENGINE_FINISH = {
  cowl: ['paint', '#e4e8ec', 0.35, 0.3], fanCase: ['steel', '#b8c0c8', 0.85, 0.34],
  casing: ['steel', '#a9b2bb', 0.9, 0.3], casingDark: ['steel', '#6f7880', 0.9, 0.38],
  liner: ['steel', '#d8d2c8', 0.9, 0.36], pipe: ['copper', '#b87a4a', 1, 0.28],
  pipeSteel: ['stainless', '#c3c9cf', 1, 0.22], unit: ['steel', '#4a535c', 0.6, 0.45],
  unitLight: ['aluminum', '#8d969f', 0.8, 0.35], harness: ['rubber', '#2b2f33', 0.1, 0.6],
  nut: ['stainless', '#cdd3d9', 1, 0.25], fan: ['steel', '#b3bbc4', 1, 0.2],
  fanEdge: ['stainless', '#dfe4e9', 1, 0.14], spinner: ['paint', '#e9ecef', 0.4, 0.22],
  blade: ['steel', '#cfd5dc', 1, 0.24], stator: ['steel', '#99a3ad', 1, 0.3],
  disc: ['steel', '#8f99a3', 1, 0.28], drum: ['steel', '#a5aeb7', 1, 0.26],
  shaft: ['steel', '#8d969f', 1, 0.22], hpt1: ['steel', '#d99a62', 1, 0.3],
  hpt2: ['steel', '#c99468', 1, 0.3], ngv: ['steel', '#cf8e58', 1, 0.34],
  lpt: ['steel', '#bfa88e', 1, 0.28], plug: ['steel', '#8f8a84', 1, 0.4],
  copper: ['copper', '#c07a46', 1, 0.3],
};

const SECTIONS = {
  housing: ['短舱与机匣', 'Nacelle and casing', -500],
  fan: ['风扇组件', 'Fan assembly', -1700],
  lpc: ['低压压气机', 'Low-pressure compressor', -750],
  hpc: ['高压压气机', 'High-pressure compressor', 250],
  comb: ['燃烧室', 'Combustor', 1300],
  hpt: ['高压涡轮', 'High-pressure turbine', 2300],
  lpt: ['低压涡轮与喷口', 'Low-pressure turbine and exhaust', 3400],
  shaft: ['同轴传动系统', 'Coaxial shaft system', 0],
};

// 依照外壳 → 附件 → 各级转静子 → 传动轴的顺序拆卸。
const COMPONENTS = [
  ['housing_static_cowl', '短舱外罩与进气唇口', '形成进气口和外涵道外形，包覆并保护发动机。'],
  ['housing_static_nut', '机匣连接螺栓组', '将各段机匣法兰连接并锁紧。'],
  ['housing_static_fanCase', '风扇机匣与外涵道壁', '包容风扇叶尖并引导外涵气流。'],
  ['housing_static_casing', '核心机机匣', '承载核心机各级转子外部的静止结构。'],
  ['housing_static_casingDark', '机匣加强环与支撑框', '提高机匣刚度，并连接相邻模块。'],
  ['housing_static_unit', '附件齿轮箱与控制器', '容纳附件传动与发动机控制组件。'],
  ['housing_static_unitLight', '可调静子作动筒', '驱动可调静子联动机构。'],
  ['housing_static_pipeSteel', '静子联动环与冷却管路', '同步调节导向叶片并输送冷却空气。'],
  ['housing_static_pipe', '滑油与引气管路', '输送润滑油及引气，连接发动机附件。'],
  ['housing_static_harness', '电气线束', '连接传感器与电子控制单元。'],
  ['fan_lp_spinner', '风扇整流锥', '将进气平顺引向风扇叶根与叶尖。'],
  ['fan_lp_nut', '整流锥紧固件', '固定整流锥与风扇转子连接处。'],
  ['fan_lp_fanEdge', '风扇叶片前缘包边', '保护叶片前缘并增强抗冲击能力。'],
  ['fan_lp_fan', '大弦长风扇叶片', '加速大量空气，产生主要推力。'],
  ['fan_lp_disc', '风扇轮毂与叶根平台', '支撑叶根并传递低压轴扭矩。'],
  ['fan_static_stator', '风扇出口导向叶片', '消除旋流并将气流导向内外涵道。'],
  ['fan_static_casingDark', '风扇支撑环', '将风扇出口静子固定在机匣上。'],
  ['lpc_static_stator', '低压压气机静子组', '扩压减速并调整进入下一级转子的气流角度。'],
  ['lpc_lp_blade', '三级增压转子叶片', '在风扇后继续提高进入核心机的空气压力。'],
  ['lpc_lp_disc', '低压压气机转子盘', '固定三级叶片并传递扭矩。'],
  ['lpc_lp_drum', '低压压气机鼓筒', '连接低压压气机各级转子。'],
  ['hpc_static_stator', '高压压气机静子组', '逐级扩压并校正八级压气机中的气流方向。'],
  ['hpc_hp_blade', '八级高压转子叶片', '将空气压缩到燃烧室所需的高压状态。'],
  ['hpc_hp_disc', '高压压气机转子盘', '支撑叶片并承受高速旋转产生的载荷。'],
  ['hpc_hp_drum', '高压压气机鼓筒', '将各级高压转子连接到高压轴。'],
  ['comb_static_pipe', '燃油总管', '将燃油分配到环形燃烧室的各个喷嘴。'],
  ['comb_static_copper', '燃油喷嘴组', '雾化燃油，使其与压缩空气混合。'],
  ['comb_static_casingDark', '燃烧室扩压器与旋流器', '降低气流速度并形成稳定燃烧所需的旋流。'],
  ['comb_static_liner', '环形火焰筒与冷却环', '容纳燃烧区，并利用冷却气膜保护筒壁。'],
  ['hpt_static_ngv', '高压涡轮导向叶片', '使高温燃气以合适角度进入涡轮转子。'],
  ['hpt_hp_hpt1', '一级高压涡轮叶片', '从高温燃气中提取能量，驱动高压压气机。'],
  ['hpt_hp_hpt2', '二级高压涡轮叶片', '继续提取燃气能量并传到高压轴。'],
  ['hpt_hp_disc', '高压涡轮转子盘', '支撑两级高压涡轮叶片。'],
  ['hpt_hp_drum', '高压涡轮轮毂', '连接高压涡轮转子盘与高压轴。'],
  ['lpt_static_lpt', '低压涡轮静子组', '引导各级低压涡轮间的燃气流动。'],
  ['lpt_lp_lpt', '五级低压涡轮叶片与叶冠', '驱动低压轴、风扇和增压级。'],
  ['lpt_lp_disc', '低压涡轮转子盘', '固定五级低压涡轮叶片。'],
  ['lpt_lp_drum', '低压涡轮鼓筒', '将低压涡轮各级转子联成一体。'],
  ['lpt_static_stator', '涡轮后机匣支板', '支撑后端结构并整流排气。'],
  ['lpt_static_casingDark', '喷口连接环', '连接喷口与尾锥周围的结构。'],
  ['lpt_static_plug', '排气尾锥', '平顺收缩核心机排气通道。'],
  ['shaft_static_casingDark', '轴承座与支承腔', '定位同轴转子并将载荷传递到机匣。'],
  ['shaft_hp_shaft', '高压空心轴', '连接高压压气机与高压涡轮。'],
  ['shaft_lp_shaft', '低压贯通轴', '穿过高压空心轴，连接风扇与低压涡轮。'],
];

const SHELL_FINISHES = new Set(['cowl', 'fanCase', 'casing', 'casingDark', 'liner']);
export const ENGINE = {
  object: {
    name: '高涵道比涡扇发动机', name_en: 'High-Bypass Turbofan', category: '航空动力 · 涡扇发动机',
    summary: '双转子高涵道比涡扇发动机，包含风扇、三级增压级、八级高压压气机、环形燃烧室及两级高压、五级低压涡轮。可按装配组件查看并逐件拆解。',
    principle: '风扇将空气分为内外涵道。外涵空气直接向后加速产生推力；内涵空气经逐级压缩后进入燃烧室，与燃油混合燃烧，再推动高低压涡轮。两根同轴传动轴分别驱动高压压气机，以及风扇和低压压气机。',
    overall_size_mm: [4750, 2400, 2400], view: [-1.05, 0.65, 1.65],
    assumptions: ['模型采用典型涡扇结构与级数，不对应特定发动机型号。', '每级重复叶片和紧固件按组件合并；爆炸视图用于结构教学。'],
  },
  parts: COMPONENTS.map(([key, name, fn], index) => {
    const [section, spool, finish] = key.split('_');
    const [material, color] = ENGINE_FINISH[finish];
    const shell = spool === 'static' && SHELL_FINISHES.has(finish);
    const dx = SECTIONS[section][2];
    const offset = shell ? [dx * 0.3, 1500 + index % 3 * 350, -700]
      : section === 'housing' ? [-400, -1100 - index % 3 * 300, 1100]
        : section === 'shaft' ? [spool === 'hp' ? 600 : -800, -1800, spool === 'hp' ? -900 : 900]
          : [dx, spool === 'static' ? -850 : 0, spool === 'static' ? -450 : 0];
    return {
      id: key, name, name_en: `${SECTIONS[section][1]} / ${finish}`, group: SECTIONS[section][0],
      material, color, is_shell: shell, order: index + 1, function: fn,
      description: spool === 'lp' ? '低压转子组件，与风扇、增压级及低压涡轮同轴联动。'
        : spool === 'hp' ? '高压转子组件，与高压压气机和高压涡轮同轴联动。' : '静止组件，装配状态下固定在发动机机匣或支承结构上。',
      position: [0, 0, 0], rotation: [0, 0, 0], explode: offset,
      ...(spool !== 'static' ? { motion: { type: 'rotate', axis: [1, 0, 0], speed: spool === 'lp' ? 0.764 : 1.305 } } : {}),
      shapes: [{ type: 'enginePart', params: { key }, position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
  }),
};
