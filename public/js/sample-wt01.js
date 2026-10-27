// 内置示例：风力发电机组（水平轴、三叶片、双馈式：主轴 + 齿轮箱 + 发电机）
// 坐标：mm，Y 向上；风轮朝 +Z（默认视角的前方），机舱向 -Z 延伸。
// 机舱特写：叶片只画叶根段（cut），塔筒只画塔顶一段，重点展示机舱内的传动链。

const TT = 11000;        // 塔顶高度
const SY = 12500;        // 主轴中心高度
const HZ = 3500;         // 轮毂中心 Z
const HSY = SY + 850;    // 高速轴（齿轮箱输出 → 发电机）中心高度
const BLADE_L = 9000;
const BLADE_R0 = 1380;   // 叶根到轮毂中心的距离
const ROTOR = 0.25;      // 风轮转速倍率（主轴转角的 0.25 倍，约 7.5 rpm）
const SUN = 1;           // 行星级太阳轮 / 中间轴（增速 4 倍）
const HSS = -3.25;       // 高速轴（平行级再增速 3.25 倍，与中间轴反向）

const P = (type, params, position = [0, 0, 0], rotation = [0, 0, 0], array) =>
  (array ? { type, params, position, rotation, array } : { type, params, position, rotation });
const AZ = [90, 0, 0];   // 局部 Y 轴 → +Z
const ring = (count, radius, axis, startAngle = 0, rotate = false) => ({ count, radius, axis, startAngle, rotate });
const rad = (d) => (d * Math.PI) / 180;
const BLADES = [0, 120, 240];
const dirOf = (a) => [-Math.sin(rad(a)), Math.cos(rad(a)), 0];   // 叶片展向（绕 Z 转 a 度后的局部 Y）
const tanOf = (a) => [Math.cos(rad(a)), Math.sin(rad(a)), 0];
const at = (a, r, t = 0, z = 0) => { const d = dirOf(a), q = tanOf(a); return [d[0] * r + q[0] * t, d[1] * r + q[1] * t, z]; };
const spin = (speed) => ({ type: 'rotate', axis: [0, 0, 1], speed });

const C = {
  white: '#e3e8eb', tower: '#d9dfe3', teal: '#3d7a90', gray: '#69737a', dark: '#454d54',
  steel: '#9aa3ab', gen: '#3d6b55', orange: '#c4834f', cabinet: '#c3cacf',
};

function build() {
  const parts = [];
  const add = (p) => parts.push({ is_shell: false, rotation: [0, 0, 0], description: '', ...p });

  // ===== 塔筒（只画塔顶一段，内部爬梯可在透视模式下看到） =====
  const TB = TT - 3200;
  add({
    id: 'tower', name: '塔筒（塔顶段）', name_en: 'Tower top section', group: '塔筒', material: 'paint', color: C.tower, is_shell: true,
    function: '把机舱和风轮举到高处风速更大、更稳定的位置（这里只画了塔顶一段）。', description: '锥形钢制塔筒，各段用内法兰螺栓连接，内部有爬梯、平台和电缆。',
    position: [0, 0, 0], explode: [0, -1600, 0],
    shapes: [
      P('lathe', { points: [[1195, TB], [1235, TB], [1150, TT], [1110, TT], [1195, TB]], sharp: true }),
      P('tube', { outerRadius: 1230, innerRadius: 1000, height: 80 }, [0, TT - 40, 0]),
      P('tube', { outerRadius: 1250, innerRadius: 1130, height: 60 }, [0, TB + 1400, 0]),
    ],
  });
  add({
    id: 'ladder', name: '塔内爬梯', name_en: 'Tower ladder', group: '塔筒', material: 'aluminum', color: '#c9a24a',
    function: '运维人员沿爬梯从塔底登上机舱。', description: '铝合金直梯，配防坠落导轨。',
    position: [0, 0, -880], explode: [0, -1600, -900],
    shapes: [
      P('cylinder', { radius: 22, height: 3100 }, [-230, TB + 1550, 0]),
      P('cylinder', { radius: 22, height: 3100 }, [230, TB + 1550, 0]),
      P('cylinder', { radius: 14, height: 460 }, [0, TB + 150, 0], [0, 0, 90], { count: 10, spacing: [0, 300, 0] }),
    ],
  });

  // ===== 偏航系统 =====
  add({
    id: 'yaw_bearing', name: '偏航轴承与齿圈', name_en: 'Yaw bearing & ring gear', group: '偏航系统', material: 'paint', color: '#7a6a9e',
    function: '连接塔筒和机舱，让机舱可以整体转动对准风向。', description: '大型四点接触球轴承，外圈带齿，与偏航驱动的小齿轮啮合。',
    position: [0, 0, 0], explode: [0, -700, 0],
    shapes: [
      P('gear', { radius: 1600, teeth: 120, toothDepth: 60, thickness: 200, innerRadius: 1300 }, [0, TT + 100, 0]),
      P('tube', { outerRadius: 1320, innerRadius: 1100, height: 200 }, [0, TT + 100, 0]),
    ],
  });
  add({
    id: 'yaw_drives', name: '偏航驱动（4 套）', name_en: 'Yaw drives', group: '偏航系统', material: 'paint', color: '#4d5960',
    function: '风向变化时，4 套电机减速器同步驱动机舱转向，使风轮正对来风。', description: '立式电机 + 多级行星减速器，输出小齿轮与偏航齿圈啮合；停机时由偏航制动器锁住。',
    position: [0, 0, 0], explode: [0, -350, 0],
    shapes: [
      P('gear', { radius: 180, teeth: 14, toothDepth: 50, thickness: 200 }, [0, TT + 100, 0], [0, 0, 0], ring(4, 1780, 'y', 45)),
      P('cylinder', { radius: 230, height: 600 }, [0, TT + 520, 0], [0, 0, 0], ring(4, 1780, 'y', 45)),
      P('cylinder', { radius: 180, height: 520 }, [0, TT + 1080, 0], [0, 0, 0], ring(4, 1780, 'y', 45)),
      P('cylinder', { radius: 200, height: 40 }, [0, TT + 1360, 0], [0, 0, 0], ring(4, 1780, 'y', 45)),
    ],
  });

  // ===== 机舱底座 =====
  add({
    id: 'bedplate', name: '机舱底座', name_en: 'Bedplate & rear frame', group: '机舱底座', material: 'steel', color: '#aab2b9',
    function: '机舱内所有设备的安装骨架：前部铸造底座承托主轴承和齿轮箱，后部焊接机架承托发电机和电控柜。', description: '前部为球墨铸铁底座，坐在偏航轴承上；后部为钢结构机架，上铺检修走道板。',
    position: [0, 0, 0], explode: [0, 0, 0],
    shapes: [
      P('roundedBox', { width: 2600, height: 500, depth: 3350, radius: 80 }, [0, TT + 450, 525]),
      P('box', { width: 300, height: 400, depth: 4000 }, [-700, TT + 600, -3150]),
      P('box', { width: 300, height: 400, depth: 4000 }, [700, TT + 600, -3150]),
      P('box', { width: 3300, height: 40, depth: 4000 }, [0, TT + 780, -3150]),
      P('box', { width: 300, height: 730, depth: 400 }, [-550, TT + 1165, -3800]),
      P('box', { width: 300, height: 730, depth: 400 }, [550, TT + 1165, -3800]),
      P('box', { width: 300, height: 730, depth: 400 }, [-550, TT + 1165, -4900]),
      P('box', { width: 300, height: 730, depth: 400 }, [550, TT + 1165, -4900]),
    ],
  });

  // ===== 机舱罩 =====
  add({
    id: 'nacelle_cover', name: '机舱罩', name_en: 'Nacelle cover', group: '机舱罩', material: 'paint', color: C.white, is_shell: true,
    function: '保护机舱内的传动链和电气设备不受风雨、盐雾侵蚀。', description: '玻璃钢罩体，顶部有检修天窗，尾部设通风百叶。',
    position: [0, 0, 0], explode: [0, 7200, 0],
    shapes: [
      P('roundedBox', { width: 3600, height: 3200, depth: 7600, radius: 520 }, [0, 12850, -1500]),
      P('roundedBox', { width: 1300, height: 60, depth: 1100, radius: 20 }, [0, 14470, -600]),
      P('box', { width: 1400, height: 50, depth: 800 }, [0, 13100, -5310]),
      P('box', { width: 1400, height: 50, depth: 800 }, [0, 13300, -5310]),
      P('box', { width: 1400, height: 50, depth: 800 }, [0, 13500, -5310]),
    ],
  });

  // ===== 叶片 =====
  BLADES.forEach((a, i) => {
    const d = dirOf(a);
    add({
      id: `blade_${i + 1}`, name: `叶片 ${i + 1}`, name_en: `Rotor blade ${i + 1}`, group: '叶片', material: 'paint', color: C.white,
      function: '把风的动能转换为风轮的转矩。翼型截面在气流中产生升力，带动风轮旋转。', description: '玻璃纤维/碳纤维复合材料叶片，根部为圆柱段，用一圈螺栓与变桨轴承连接；越靠叶尖弦长越窄、扭角越小。',
      position: [0, SY, HZ], explode: [d[0] * 2600, d[1] * 2600, 4800], motion: spin(ROTOR),
      shapes: [
        P('blade', { length: BLADE_L, rootRadius: 460, chord: 1900, tipChord: 380, twist: 14, cut: 1700 }, at(a, BLADE_R0), [0, 0, a]),
        P('tube', { outerRadius: 540, innerRadius: 400, height: 80 }, at(a, BLADE_R0 + 40), [0, 0, a]),
      ],
    });
  });

  // ===== 轮毂与变桨 =====
  add({
    id: 'spinner', name: '导流罩', name_en: 'Spinner', group: '轮毂与变桨', material: 'paint', color: C.white, is_shell: true,
    function: '包住轮毂，减小迎风阻力，同时保护变桨系统。', description: '玻璃钢流线形罩体，随风轮一起转动。',
    position: [0, SY, HZ], explode: [0, 0, 9500], motion: spin(ROTOR),
    shapes: [P('lathe', { points: [[1750, -1150], [1800, -900], [1760, -300], [1610, 300], [1320, 900], [880, 1500], [380, 1950], [0, 2100]] }, [0, 0, 0], AZ)],
  });
  add({
    id: 'hub', name: '轮毂', name_en: 'Hub', group: '轮毂与变桨', material: 'paint', color: '#9a7a4a',
    function: '安装三支叶片，把风轮转矩传给主轴。', description: '球墨铸铁轮毂，三个叶片安装法兰按 120° 分布，后端法兰与主轴法兰用螺栓连接。',
    position: [0, SY, HZ], explode: [0, 0, 4800], motion: spin(ROTOR),
    shapes: [
      P('sphere', { radius: 1180 }),
      ...BLADES.map((a) => P('cylinder', { radius: 640, height: 320 }, at(a, 1060), [0, 0, a])),
      P('cylinder', { radius: 920, height: 220 }, [0, 0, -1000], AZ),
    ],
  });
  add({
    id: 'pitch_bearings', name: '变桨轴承（3 套）', name_en: 'Pitch bearings', group: '轮毂与变桨', material: 'steel', color: C.steel,
    function: '让叶片可以绕自身轴线转动，改变桨距角来调节功率、启停和保护机组。', description: '双排四点接触球轴承，内圈带齿，外圈装在轮毂上，内圈连接叶根。',
    position: [0, SY, HZ], explode: [0, 0, 4800], motion: spin(ROTOR),
    shapes: BLADES.flatMap((a) => [
      P('tube', { outerRadius: 660, innerRadius: 480, height: 160 }, at(a, 1300), [0, 0, a]),
      P('gear', { radius: 470, teeth: 70, toothDepth: 30, thickness: 120, innerRadius: 380 }, at(a, 1180), [0, 0, a]),
    ]),
  });
  add({
    id: 'pitch_drives', name: '变桨驱动（3 套）', name_en: 'Pitch drives', group: '轮毂与变桨', material: 'paint', color: C.orange,
    function: '驱动变桨轴承内圈转动，三支叶片各自独立变桨；电网失电时由后备电池把叶片顺桨停机。', description: '变桨电机 + 减速器，装在轮毂内，每支叶片一套，配有后备电源柜。',
    position: [0, SY, HZ], explode: [0, 0, 3300], motion: spin(ROTOR),
    shapes: BLADES.flatMap((a) => [
      P('cylinder', { radius: 150, height: 620 }, at(a, 880, 380), [0, 0, a]),
      P('cylinder', { radius: 110, height: 200 }, at(a, 1250, 380), [0, 0, a]),
      P('roundedBox', { width: 360, height: 360, depth: 260, radius: 20 }, at(a, 560, -380), [0, 0, a]),
    ]),
  });

  // ===== 主轴与主轴承 =====
  add({
    id: 'main_shaft', name: '主轴', name_en: 'Main shaft', group: '主轴与主轴承', material: 'steel', color: '#a3abb3',
    function: '把风轮的低速大转矩传给齿轮箱。', description: '空心锻钢主轴，前端法兰连接轮毂，后端用胀紧套与齿轮箱行星架连接。',
    position: [0, SY, 0], explode: [0, 0, 2000], motion: spin(ROTOR),
    shapes: [
      P('flange', { radius: 900, thickness: 150, holes: 0 }, [0, 0, 2300], AZ),
      P('nut', { diameter: 36, size: 56, thickness: 36 }, [0, 0, 2207], AZ, ring(16, 790, 'z', 11.25)),
      P('cylinder', { radius: 380, height: 2600 }, [0, 0, 1000], AZ),
      P('cylinder', { radius: 450, height: 300 }, [0, 0, 1900], AZ),
      P('tube', { outerRadius: 520, innerRadius: 380, height: 180 }, [0, 0, -200], AZ),
    ],
  });
  add({
    id: 'main_bearing', name: '主轴承与轴承座', name_en: 'Main bearing & housing', group: '主轴与主轴承', material: 'paint', color: C.teal,
    function: '支撑主轴和风轮重量，承受风轮传来的推力和弯矩。', description: '调心滚子轴承，装在铸造轴承座内，轴承座用螺栓固定在机舱底座上。',
    position: [0, SY, 0], explode: [0, 2200, 1200],
    shapes: [
      P('bearing', { outerRadius: 800, innerRadius: 390, width: 480 }, [0, 0, 1500], AZ),
      P('tube', { outerRadius: 920, innerRadius: 790, height: 620 }, [0, 0, 1500], AZ),
      P('roundedBox', { width: 2200, height: 700, depth: 620, radius: 40 }, [0, -650, 1500]),
      P('nut', { diameter: 36, size: 56, thickness: 36 }, [-900, -282, 1350], [0, 0, 0], { count: 2, spacing: [0, 0, 300] }),
      P('nut', { diameter: 36, size: 56, thickness: 36 }, [900, -282, 1350], [0, 0, 0], { count: 2, spacing: [0, 0, 300] }),
    ],
  });

  // ===== 齿轮箱 =====
  add({
    id: 'gearbox_housing', name: '齿轮箱箱体', name_en: 'Gearbox housing', group: '齿轮箱', material: 'paint', color: C.teal, is_shell: true,
    function: '容纳一级行星 + 一级平行轴齿轮，并储存润滑油；两侧扭力臂把反扭矩传到底座。', description: '前段为行星级圆形箱体，后段为平行级箱体，扭力臂下装弹性减振支座。',
    position: [0, SY, 0], explode: [0, 2900, -400],
    shapes: [
      P('lathe', { points: [[400, -1700], [1000, -1700], [1150, -1600], [1250, -1500], [1250, -500], [1150, -420], [1150, -300], [400, -300], [400, -1700]], sharp: true }, [0, 0, 0], AZ),
      P('roundedBox', { width: 1900, height: 2100, depth: 1100, radius: 60 }, [0, 400, -2250]),
      P('roundedBox', { width: 700, height: 450, depth: 500, radius: 30 }, [-1250, 0, -1000]),
      P('roundedBox', { width: 700, height: 450, depth: 500, radius: 30 }, [1250, 0, -1000]),
      P('cylinder', { radius: 200, height: 560 }, [-1250, -505, -1000]),
      P('cylinder', { radius: 200, height: 560 }, [1250, -505, -1000]),
      P('cylinder', { radius: 260, height: 120 }, [0, 850, -2860], AZ),
    ],
  });
  add({
    id: 'ring_gear', name: '行星级齿圈', name_en: 'Planetary ring gear', group: '齿轮箱', material: 'steel', color: '#8b939b',
    function: '固定不转的内齿圈，与行星轮啮合。', description: '渗碳淬火内齿圈，夹在行星级前后箱体之间。',
    position: [0, SY, 0], explode: [-2800, 1000, 0],
    shapes: [P('tube', { outerRadius: 1080, innerRadius: 960, height: 460 }, [0, 0, -1000], AZ)],
  });
  add({
    id: 'planet_carrier', name: '行星架与行星轮', name_en: 'Planet carrier & planets', group: '齿轮箱', material: 'steel', color: '#a7afb6',
    function: '主轴带动行星架转动，三个行星轮在固定齿圈内滚动，推动中心的太阳轮加速旋转（第一级增速）。', description: '行星架为铸钢件，三个行星轮装在行星轴上，按 120° 均布。',
    position: [0, SY, 0], explode: [2800, 1000, 0], motion: spin(ROTOR),
    shapes: [
      P('cylinder', { radius: 780, height: 120 }, [0, 0, -640], AZ),
      P('cylinder', { radius: 780, height: 120 }, [0, 0, -1360], AZ),
      P('gear', { radius: 330, teeth: 26, toothDepth: 45, thickness: 420 }, [0, 0, -1000], AZ, ring(3, 630, 'z', 90)),
      P('cylinder', { radius: 70, height: 840 }, [0, 0, -1000], AZ, ring(3, 630, 'z', 90)),
    ],
  });
  add({
    id: 'sun_shaft', name: '太阳轮与中间轴', name_en: 'Sun gear & intermediate shaft', group: '齿轮箱', material: 'steel', color: '#b4bbc1',
    function: '太阳轮把行星级的输出传给平行级大齿轮。', description: '太阳轮、中间轴和平行级大齿轮为一体，转速是风轮的 4 倍。',
    position: [0, SY, 0], explode: [0, 0, 0], motion: spin(SUN),
    shapes: [
      P('gear', { radius: 290, teeth: 20, toothDepth: 45, thickness: 420 }, [0, 0, -1000], AZ),
      P('cylinder', { radius: 150, height: 1500 }, [0, 0, -1750], AZ),
      P('gear', { radius: 650, teeth: 60, toothDepth: 40, thickness: 220, innerRadius: 150 }, [0, 0, -2200], AZ),
    ],
  });

  // ===== 制动与联轴器（高速轴） =====
  add({
    id: 'hss', name: '高速轴与制动盘', name_en: 'High-speed shaft & brake disc', group: '制动与联轴器', material: 'steel', color: '#b4bbc1',
    function: '平行级小齿轮把转速再提高 3.25 倍，带动发电机；制动盘用于停机时刹住传动链。', description: '小齿轮轴伸出齿轮箱后端，装有制动盘，转速约为风轮的 13 倍。',
    position: [0, HSY, 0], explode: [0, 0, -900], motion: spin(HSS),
    shapes: [
      P('gear', { radius: 200, teeth: 18, toothDepth: 40, thickness: 260 }, [0, 0, -2200], AZ),
      P('cylinder', { radius: 110, height: 1000 }, [0, 0, -2600], AZ),
      P('flange', { radius: 450, thickness: 50, holes: 12, holeRadius: 18, holeCircle: 300 }, [0, 0, -2950], AZ),
    ],
  });
  add({
    id: 'brake_caliper', name: '制动钳', name_en: 'Brake caliper', group: '制动与联轴器', material: 'paint', color: '#b0473f',
    function: '液压驱动夹紧制动盘，在紧急停机或检修时锁定传动链。', description: '浮动式液压制动钳，装在齿轮箱后壁上。',
    position: [0, HSY, 0], explode: [0, 900, -900],
    shapes: [P('roundedBox', { width: 260, height: 220, depth: 200, radius: 20 }, [0, 450, -2950])],
  });
  add({
    id: 'coupling', name: '弹性联轴器', name_en: 'Flexible coupling', group: '制动与联轴器', material: 'paint', color: C.orange,
    function: '连接齿轮箱高速轴和发电机轴，补偿两轴的不对中，并起电气绝缘作用。', description: '复合材料中间管 + 两端膜片组。',
    position: [0, HSY, 0], explode: [0, 0, -1300], motion: spin(HSS),
    shapes: [
      P('cylinder', { radius: 160, height: 340 }, [0, 0, -3250], AZ),
      P('flange', { radius: 300, thickness: 60, holes: 8, holeRadius: 18 }, [0, 0, -3080], AZ),
      P('flange', { radius: 300, thickness: 60, holes: 8, holeRadius: 18 }, [0, 0, -3420], AZ),
    ],
  });

  // ===== 发电机 =====
  add({
    id: 'generator', name: '发电机定子与机壳', name_en: 'Generator stator & housing', group: '发电机', material: 'paint', color: C.gen, is_shell: true,
    function: '定子绕组在旋转磁场中感应出电流，把机械能转换为电能。', description: '双馈异步发电机，机壳外圈散热筋，后部为滑环室，侧面为接线盒。',
    position: [0, HSY, -4300], explode: [0, 2600, -1800],
    shapes: [
      P('finnedCylinder', { radius: 760, length: 1500, fins: 16, finRadius: 820 }, [0, 0, 0], AZ),
      P('cylinder', { radius: 800, height: 80 }, [0, 0, 780], AZ),
      P('cylinder', { radius: 800, height: 80 }, [0, 0, -780], AZ),
      P('cylinder', { radius: 420, height: 100 }, [0, 0, -880], AZ),
      P('roundedBox', { width: 300, height: 420, depth: 500, radius: 20 }, [930, 200, 0]),
    ],
  });
  add({
    id: 'gen_rotor', name: '发电机转子', name_en: 'Generator rotor', group: '发电机', material: 'copper', color: '#b0703f',
    function: '转子绕组通过滑环接入变流器，调节励磁使机组在变化的转速下输出稳定频率的电能。', description: '叠片铁芯 + 铜绕组，两端为轴承和滑环。',
    position: [0, HSY, -4300], explode: [0, 0, -1800], motion: spin(HSS),
    shapes: [
      P('cylinder', { radius: 600, height: 1350 }, [0, 0, 0], AZ),
      P('cylinder', { radius: 110, height: 1950 }, [0, 0, 120], AZ),
      P('tube', { outerRadius: 620, innerRadius: 560, height: 60 }, [0, 0, 300], AZ, { count: 3, spacing: [0, 0, -300] }),
    ],
  });

  // ===== 冷却与控制 =====
  add({
    id: 'control_cabinet', name: '主控柜', name_en: 'Control cabinet', group: '冷却与控制', material: 'paint', color: C.cabinet,
    function: '机组的大脑：采集风速、转速、温度等信号，控制偏航、变桨、并网和保护停机。', description: 'PLC 主控 + 安全链模块，柜门朝检修走道。',
    position: [-1450, 12550, -4300], explode: [-1600, 0, 0],
    shapes: [
      P('roundedBox', { width: 500, height: 1500, depth: 1200, radius: 20 }),
      P('box', { width: 20, height: 1300, depth: 10 }, [255, 0, 0]),
      P('cylinder', { radius: 30, height: 30 }, [262, 400, 400], [0, 0, 90]),
    ],
  });
  add({
    id: 'converter', name: '变流器柜', name_en: 'Power converter', group: '冷却与控制', material: 'paint', color: C.cabinet,
    function: '控制转子侧励磁电流，把发电机输出调整为与电网同频同相的电能。', description: '背靠背 IGBT 变流器，水冷散热。',
    position: [1450, 12550, -4300], explode: [1600, 0, 0],
    shapes: [
      P('roundedBox', { width: 500, height: 1500, depth: 1200, radius: 20 }),
      P('box', { width: 20, height: 1300, depth: 10 }, [-255, 0, 0]),
    ],
  });
  add({
    id: 'hydraulic', name: '液压站', name_en: 'Hydraulic unit', group: '冷却与控制', material: 'paint', color: '#5b6870',
    function: '为高速轴制动器和偏航制动器提供液压压力。', description: '油箱 + 电机泵组 + 蓄能器。',
    position: [1350, 12050, -2200], explode: [1500, 0, 0],
    shapes: [
      P('roundedBox', { width: 500, height: 500, depth: 600, radius: 20 }),
      P('capsule', { radius: 80, length: 260 }, [0, 400, -150]),
      P('cylinder', { radius: 90, height: 200 }, [0, 350, 150]),
    ],
  });
  add({
    id: 'cooler', name: '顶置散热器', name_en: 'Roof-top cooler', group: '冷却与控制', material: 'brass', color: '#b8963f',
    function: '把齿轮箱润滑油和变流器冷却水的热量散到空气中。', description: '自然风冷翅片式散热器，装在机舱尾部顶上。',
    position: [0, 15000, -4900], explode: [0, 8000, -600],
    shapes: [
      P('roundedBox', { width: 2600, height: 1100, depth: 220, radius: 30 }),
      P('box', { width: 2500, height: 12, depth: 230 }, [0, -440, 0], [0, 0, 0], { count: 9, spacing: [0, 110, 0] }),
      P('box', { width: 80, height: 500, depth: 80 }, [-1100, -700, 0]),
      P('box', { width: 80, height: 500, depth: 80 }, [1100, -700, 0]),
    ],
  });

  // ===== 测风系统 =====
  add({
    id: 'anemometer', name: '风速仪', name_en: 'Cup anemometer', group: '测风系统', material: 'aluminum', color: '#cfd5da',
    function: '测量风速，主控据此决定启动、并网、变桨和大风停机。', description: '三杯式风速仪，装在机舱顶部尾端的测风支架上。',
    position: [700, 15650, -3900], explode: [0, 8000, 0], motion: { type: 'rotate', axis: [0, 1, 0], speed: 2 },
    shapes: [
      P('cylinder', { radius: 45, height: 1200 }, [0, -600, 0]),
      P('cylinder', { radius: 60, height: 120 }, [0, 60, 0]),
      P('cylinder', { radius: 14, height: 300 }, [0, 80, 0], [0, 0, 90], ring(3, 150, 'y', 0, true)),
      P('sphere', { radius: 80 }, [0, 80, 0], [0, 0, 0], ring(3, 300, 'y')),
    ],
  });
  add({
    id: 'wind_vane', name: '风向标', name_en: 'Wind vane', group: '测风系统', material: 'aluminum', color: '#cfd5da',
    function: '测量风向，主控据此驱动偏航系统对风。', description: '尾翼式风向标，与风速仪并排安装。',
    position: [-700, 15650, -3900], explode: [0, 8000, 0],
    shapes: [
      P('cylinder', { radius: 45, height: 1200 }, [0, -600, 0]),
      P('cylinder', { radius: 14, height: 600 }, [0, 80, 0], AZ),
      P('extrude', { points: [[0, 0], [260, 0], [260, 220]], thickness: 12 }, [0, 80, -300], [0, 90, 0]),
      P('cone', { radius: 40, height: 120 }, [0, 80, 340], AZ),
    ],
  });

  // 拆卸顺序：先拆机舱罩、测风和散热器，再拆风轮（导流罩、叶片、轮毂），然后由后往前拆传动链，最后是底座、偏航和塔筒
  const DIS = ['测风系统', '机舱罩', '冷却与控制', '叶片', '轮毂与变桨', '发电机', '制动与联轴器', '齿轮箱', '主轴与主轴承', '机舱底座', '偏航系统', '塔筒'];
  [...parts].sort((a, b) => DIS.indexOf(a.group) - DIS.indexOf(b.group)).forEach((p, i) => { p.order = i + 1; });
  return parts;
}

export const WT01 = {
  object: {
    name: '风力发电机组',
    name_en: 'Wind Turbine Generator',
    category: '风电行业 · 双馈式风力发电机组',
    summary: '水平轴三叶片上风向风力发电机组：风轮带动主轴，经一级行星 + 一级平行轴齿轮箱增速后驱动双馈发电机；机舱可通过偏航系统整体转向对风，叶片可独立变桨调节功率。',
    principle: '风吹过叶片翼型产生升力，使风轮以约 10 rpm 低速旋转。主轴把转矩传给齿轮箱，行星级和平行级共增速约 13 倍后带动发电机高速旋转发电。主控根据风速仪和风向标的信号控制偏航驱动对风，并通过变桨系统改变叶片角度，在额定风速以上限制功率、大风时顺桨停机。',
    overall_size_mm: [7200, 8800, 11000],
    view: [1, 0.5, 0.42],
    confidence: 0.85,
    assumptions: ['机舱特写：叶片只画叶根段、塔筒只画塔顶段，便于看清机舱内部', '齿轮箱简化为一级行星 + 一级平行轴', '电缆、爬梯、平台和润滑管路未建模'],
  },
  parts: build(),
};
