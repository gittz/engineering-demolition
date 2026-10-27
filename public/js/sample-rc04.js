// 内置示例：石化四缸往复压缩机（卧式四列对称平衡型）
// 用代码生成数据：四列结构相同，只是所在侧（±X）、位置和曲柄相位不同。
// 坐标：mm，Y 向上；曲轴沿 Z 轴，气缸沿 ±X 方向对置；电机在 -Z 一侧（默认视角的后方）。

const Y0 = 750;          // 曲轴中心高度
const R = 90;            // 曲柄半径（行程 180 mm）
const L = 600;           // 连杆中心距
const XP = R + L;        // 上止点时十字头销到曲轴中心的距离
const ROD = 900;         // 十字头销到活塞中心的距离
const CYL_C = 1550;      // 气缸中心（缸体 1260–1840）
const VALVES = [1420, 1680]; // 每缸两个气阀（进气侧 / 排气侧）
const BOTTLE_Y = 1430;

// 四列：z 为列中心（与四拐曲轴的曲柄位置一致），s 为气缸所在侧，phase 为相对曲轴的相位（度）
// 曲轴模板第 i 拐的曲柄销初始方向依次为 +X、-Y、-X、+Y；相位使各列在 θ+phase=0 时处于外止点
const ROWS = [
  { k: 1, z: -486, s: 1, phase: 0 },
  { k: 2, z: -162, s: -1, phase: 90 },
  { k: 3, z: 162, s: 1, phase: 180 },
  { k: 4, z: 486, s: -1, phase: -90 },
];
const SIDES = [
  { s: 1, tag: '右', en: 'right', rows: ROWS.filter((r) => r.s === 1) },
  { s: -1, tag: '左', en: 'left', rows: ROWS.filter((r) => r.s === -1) },
];
SIDES.forEach((d) => { d.zc = d.rows.reduce((a, r) => a + r.z, 0) / d.rows.length; });

const P = (type, params, position = [0, 0, 0], rotation = [0, 0, 0], array) =>
  (array ? { type, params, position, rotation, array } : { type, params, position, rotation });
const AX = (s) => [0, 0, -90 * s];  // 局部 Y 轴 → s·X 方向
const AZ = [90, 0, 0];               // 局部 Y 轴 → +Z 方向
const ring = (count, radius, axis, startAngle = 0) => ({ count, radius, axis, startAngle, rotate: false });

// 配色：低饱和工业涂装
const C = {
  paint: '#367389', paintDark: '#2e6376', skid: '#8b949b', motor: '#3f4c4b', gray: '#56626a',
  suction: '#4a82aa', discharge: '#c4834f', flange: '#454d54', steel: '#9aa3ab',
};

// 工字钢 / 槽钢截面
const ibeam = (h, w = 200, t = 22) => [[-w / 2, 0], [w / 2, 0], [w / 2, t], [9, t], [9, h - t], [w / 2, h - t], [w / 2, h], [-w / 2, h], [-w / 2, h - t], [-9, h - t], [-9, t], [-w / 2, t]];

// 压力容器轮廓（椭圆封头 + 筒体），绕 Y 轴旋转；H 为筒体半长
function vessel(r, H) {
  const h = r * 0.5;
  const pts = [];
  for (let a = 0; a <= 90; a += 15) pts.push([+(r * Math.sin(a * Math.PI / 180)).toFixed(1), +(-H - h * Math.cos(a * Math.PI / 180)).toFixed(1)]);
  for (let a = 90; a >= 0; a -= 15) pts.push([+(r * Math.sin(a * Math.PI / 180)).toFixed(1), +(H + h * Math.cos(a * Math.PI / 180)).toFixed(1)]);
  return pts;
}

// 气缸缸体轮廓（局部 y：-290 内侧法兰 … +290 外侧法兰），带水套加强筋，内孔 Ø412
const CYL_PROFILE = [
  [206, -290], [318, -290], [318, -250], [288, -250], [288, -236], [300, -224], [300, -120], [312, -112], [312, -92], [300, -84],
  [300, 84], [312, 92], [312, 112], [300, 120], [300, 224], [288, 236], [288, 250], [318, 250], [318, 290], [206, 290], [206, -290],
];
const DOME = [[300, 0], [296, 26], [280, 56], [246, 86], [192, 108], [120, 122], [0, 128]];

const NUT_L = { diameter: 22, size: 36, thickness: 22 };
const NUT_M = { diameter: 16, size: 27, thickness: 16 };

function build() {
  const parts = [];
  const add = (p) => parts.push({ is_shell: false, rotation: [0, 0, 0], description: '', ...p });
  const sliderOf = (r) => ({ type: 'slider', axis: [r.s, 0, 0], crankRadius: R, rodLength: L, phase: r.phase });

  // ===== 撬装底座 =====
  const beams = [];
  for (const x of [-1550, -520, 520, 1550]) beams.push(P('extrude', { points: ibeam(300), thickness: 3900 }, [x, 0, -550]));
  for (const z of [-2400, -1700, -1000, -200, 600, 1300]) beams.push(P('extrude', { points: ibeam(240, 160), thickness: 3300 }, [0, 0, z], [0, 90, 0]));
  add({
    id: 'skid', name: '撬装底座', name_en: 'Skid base', group: '撬装底座', material: 'paint', color: C.skid,
    function: '把压缩机、电机和辅助设备集成在一个钢结构底座上，整体吊装运输。', description: '工字钢焊接框架，纵梁承托机身和气缸支腿，现场用地脚螺栓固定在混凝土基础上。',
    position: [0, 0, 0], explode: [0, -800, 0], shapes: beams,
  });
  for (const side of SIDES) {
    const { s } = side;
    add({
      id: `supports_${side.en}`, name: `气缸支腿（${side.tag}）`, name_en: 'Cylinder supports', group: '撬装底座', material: 'paint', color: C.gray,
      function: '支撑悬伸的气缸，减小活塞杆和十字头的偏磨。', description: '可调高度的钢制支腿，底板用螺栓固定在撬座纵梁上。',
      position: [0, 0, 0], explode: [s * 1100, -380, 0],
      shapes: side.rows.flatMap((r) => [
        P('box', { width: 50, height: 158, depth: 300 }, [s * 1550, 379, r.z]),
        P('box', { width: 200, height: 20, depth: 340 }, [s * 1550, 310, r.z]),
      ]),
    });
  }

  // ===== 驱动电机 =====
  add({
    id: 'motor', name: '驱动电机', name_en: 'Drive motor', group: '驱动电机', material: 'paint', color: C.motor,
    function: '防爆异步电机，为压缩机提供动力。', description: '机壳外圈散热筋，尾部为冷却风扇罩，顶部为接线盒。',
    position: [0, Y0, -1850], explode: [0, 0, -1500],
    shapes: [
      P('finnedCylinder', { radius: 380, length: 860, fins: 14, finRadius: 450 }, [0, 0, 0], AZ),
      P('cylinder', { radius: 400, height: 70 }, [0, 0, 465], AZ),
      P('cylinder', { radius: 405, height: 160 }, [0, 0, -510], AZ),
      P('cylinder', { radius: 60, height: 100 }, [0, 0, 550], AZ),
      P('roundedBox', { width: 260, height: 170, depth: 320, radius: 16 }, [0, 520, -60]),
      P('cylinder', { radius: 34, height: 90 }, [150, 520, -60], [0, 0, 90]),
      P('box', { width: 820, height: 60, depth: 760 }, [0, -420, 0]),
      P('torus', { radius: 40, tube: 12 }, [0, 470, 300], [90, 0, 0]),
    ],
  });
  add({
    id: 'flywheel', name: '飞轮与联轴器', name_en: 'Flywheel & coupling', group: '驱动电机', material: 'iron', color: '#3a4148',
    function: '储存转动惯量、平滑转矩波动，并把电机轴与曲轴连接起来。', description: '铸铁飞轮，联轴器为膜片式。',
    position: [0, Y0, 0], explode: [0, 0, -800], motion: { type: 'rotate', axis: [0, 0, 1], speed: 1 },
    shapes: [
      P('pulley', { radius: 420, width: 160, grooves: 0, innerRadius: 70 }, [0, 0, -960], AZ),
      P('cylinder', { radius: 70, height: 360 }, [0, 0, -1030], AZ),
      P('cylinder', { radius: 175, height: 120 }, [0, 0, -1270], AZ),
      P('nut', NUT_M, [0, 0, -1205], AZ, ring(6, 130, 'z', 30)),
    ],
  });

  // ===== 曲轴箱与导向体 =====
  add({
    id: 'crankcase', name: '曲轴箱（机身）', name_en: 'Crankcase / frame', group: '曲轴箱与导向体', material: 'paint', color: C.paint, is_shell: true,
    function: '整机承力骨架，支撑曲轴并储存润滑油，四个十字头导向体从这里伸出。', description: '箱形铸铁机身，两端为主轴承座，底部为油池，侧面有油位视镜。',
    position: [0, 0, 0], explode: [0, 1650, 0],
    shapes: [
      P('roundedBox', { width: 1100, height: 80, depth: 1700, radius: 10 }, [0, 340, 0]),
      P('roundedBox', { width: 900, height: 640, depth: 1560, radius: 40 }, [0, 700, 0]),
      P('roundedBox', { width: 840, height: 40, depth: 1500, radius: 12 }, [0, 1040, 0]),
      P('cylinder', { radius: 200, height: 70 }, [0, Y0, 815], AZ),
      P('cylinder', { radius: 200, height: 70 }, [0, Y0, -815], AZ),
      P('flange', { radius: 170, thickness: 22, holes: 0 }, [0, Y0, 861], AZ),
      P('flange', { radius: 170, thickness: 22, holes: 0, innerRadius: 78 }, [0, Y0, -861], AZ),
      P('nut', NUT_M, [0, Y0, 880], AZ, ring(8, 140, 'z', 22.5)),
      P('nut', NUT_M, [0, Y0, -880], AZ, ring(8, 140, 'z', 22.5)),
      P('cylinder', { radius: 45, height: 24 }, [-460, 520, -620], AX(-1)),
      P('cylinder', { radius: 30, height: 24 }, [460, 420, -620], AX(1)),
    ],
  });
  for (const side of SIDES) {
    const { s } = side;
    add({
      id: `guides_${side.en}`, name: `十字头导向体（${side.tag}）`, name_en: 'Crosshead guides', group: '曲轴箱与导向体', material: 'paint', color: C.paint, is_shell: true,
      function: '内部为十字头滑道，连接机身与气缸，并把气缸与曲轴箱隔开。', description: '箱形铸铁导向体，顶部开检查窗；端部法兰连接填料函和气缸。',
      position: [0, 0, 0], explode: [s * 260, 650, 0],
      shapes: side.rows.flatMap((r) => [
        P('roundedBox', { width: 40, height: 540, depth: 520, radius: 8 }, [s * 475, Y0, r.z]),
        P('roundedBox', { width: 690, height: 460, depth: 440, radius: 30 }, [s * 805, Y0, r.z]),
        P('roundedBox', { width: 380, height: 24, depth: 320, radius: 10 }, [s * 800, Y0 + 242, r.z]),
        P('nut', NUT_M, [s * 640, Y0 + 262, r.z - 135], [0, 0, 0], { count: 5, spacing: [s * 80, 0, 0] }),
        P('nut', NUT_M, [s * 640, Y0 + 262, r.z + 135], [0, 0, 0], { count: 5, spacing: [s * 80, 0, 0] }),
        P('flange', { radius: 270, thickness: 40, holes: 0, innerRadius: 60 }, [s * 1170, Y0, r.z], AX(s)),
        P('nut', NUT_M, [s * 1142, Y0, r.z], AX(s), ring(10, 240, 'x', 18)),
      ]),
    });
  }

  // ===== 上盖与检修盖 =====
  add({
    id: 'covers', name: '上盖与检修盖', name_en: 'Top & inspection covers', group: '上盖与检修盖', material: 'paint', color: C.paintDark, is_shell: true,
    function: '封闭曲轴箱顶部，打开后可检查曲轴、连杆大头和十字头。', description: '两块检修盖用螺栓压紧，盖上设有呼吸器和吊环。',
    position: [0, 0, 0], explode: [0, 2300, 0],
    shapes: [
      P('roundedBox', { width: 780, height: 36, depth: 700, radius: 14 }, [0, 1078, -370]),
      P('roundedBox', { width: 780, height: 36, depth: 700, radius: 14 }, [0, 1078, 370]),
      P('nut', NUT_M, [-340, 1104, -690], [0, 0, 0], { count: 5, spacing: [170, 0, 0] }),
      P('nut', NUT_M, [-340, 1104, -50], [0, 0, 0], { count: 5, spacing: [170, 0, 0] }),
      P('nut', NUT_M, [-340, 1104, 50], [0, 0, 0], { count: 5, spacing: [170, 0, 0] }),
      P('nut', NUT_M, [-340, 1104, 690], [0, 0, 0], { count: 5, spacing: [170, 0, 0] }),
      P('cylinder', { radius: 45, height: 90 }, [200, 1140, 370]),
      P('cylinder', { radius: 62, height: 22 }, [200, 1195, 370]),
      P('torus', { radius: 40, tube: 11 }, [-200, 1140, -370], [90, 0, 0]),
      P('torus', { radius: 40, tube: 11 }, [-200, 1140, 370], [90, 0, 0]),
    ],
  });

  // ===== 曲轴组件 =====
  add({
    id: 'crankshaft', name: '四拐曲轴', name_en: 'Four-throw crankshaft', group: '曲轴组件', material: 'steel', color: '#a3abb3',
    function: '把电机的旋转传给四列连杆；曲拐按 90° 错开，使对置两列惯性力相互抵消。', description: '整体锻钢曲轴，曲柄半径 90 mm（行程 180 mm），每拐带平衡配重。',
    position: [0, Y0, 0], rotation: AZ, explode: [0, 0, 0], motion: { type: 'rotate', axis: [0, 0, 1], speed: 1 },
    shapes: [P('crankshaft', { length: 1500, journalRadius: 70, throw: R, throws: 4, pinRadius: 55, webThickness: 50, webWidth: 190, pinLength: 140 })],
  });
  add({
    id: 'main_bearings', name: '主轴承', name_en: 'Main bearings', group: '曲轴组件', material: 'stainless', color: '#b9c0c6',
    function: '支撑曲轴两端主轴颈。', description: '滚动主轴承，压装在曲轴箱两端轴承座内。',
    position: [0, Y0, 0], explode: [0, -420, 0],
    shapes: [
      P('bearing', { outerRadius: 150, innerRadius: 70, width: 100 }, [0, 0, -700], AZ),
      P('bearing', { outerRadius: 150, innerRadius: 70, width: 100 }, [0, 0, 700], AZ),
    ],
  });

  // ===== 连杆与十字头 =====
  for (const r of ROWS) {
    const { s } = r;
    add({
      id: `conrod_${r.k}`, name: `${r.k} 列连杆`, name_en: `Connecting rod, row ${r.k}`, group: '连杆与十字头', material: 'steel', color: '#7d868e',
      function: '把曲轴的旋转转换为十字头的往复运动。', description: '锻钢连杆，大头剖分式结构，内衬薄壁轴瓦，小头压装铜套。',
      position: [s * XP, Y0, r.z], rotation: AX(s), explode: [0, 0, 0],
      motion: { type: 'conrod', axis: [s, 0, 0], crankAxis: [0, 0, 1], crankRadius: R, rodLength: L, phase: r.phase },
      shapes: [P('conrod', { length: L, bigRadius: 95, smallRadius: 62, thickness: 90 })],
    });
    add({
      id: `crosshead_${r.k}`, name: `${r.k} 列十字头`, name_en: `Crosshead, row ${r.k}`, group: '连杆与十字头', material: 'steel', color: '#8b939b',
      function: '在导向体内做直线往复运动，把连杆的斜向力变成水平推力，保护活塞杆不受侧向力。', description: '铸钢十字头体，上下滑履浇铸巴氏合金。',
      position: [s * XP, Y0, r.z], explode: [0, 0, 0], motion: sliderOf(r),
      shapes: [
        P('cylinder', { radius: 140, height: 240 }, [0, 0, 0], AX(s)),
        P('box', { width: 220, height: 34, depth: 200 }, [0, 158, 0]),
        P('box', { width: 220, height: 34, depth: 200 }, [0, -158, 0]),
        P('cylinder', { radius: 42, height: 230 }, [0, 0, 0], AZ),
      ],
    });
  }

  // ===== 填料与中间接筒 =====
  for (const side of SIDES) {
    const { s } = side;
    add({
      id: `packing_${side.en}`, name: `填料函（${side.tag}）`, name_en: 'Rod packing', group: '填料与中间接筒', material: 'brass', color: '#b98d48',
      function: '密封活塞杆穿出气缸处，防止气体泄漏到导向体。', description: '多组密封环叠装，带注油和泄漏回收接口。',
      position: [0, 0, 0], explode: [s * 160, 0, 0],
      shapes: side.rows.flatMap((r) => [
        P('tube', { outerRadius: 120, innerRadius: 42, height: 110 }, [s * 1225, Y0, r.z], AX(s)),
        P('cylinder', { radius: 12, height: 70 }, [s * 1215, Y0 + 150, r.z]),
        P('cylinder', { radius: 12, height: 70 }, [s * 1240, Y0 - 150, r.z]),
      ]),
    });
  }

  // ===== 四缸气缸组件（每列一件，便于逐件拆解） =====
  for (const r of ROWS) {
    const { s } = r;
    add({
      id: `cylinder_${r.k}`, name: `${r.k} 列气缸`, name_en: `Cylinder, row ${r.k}`, group: '四缸气缸组件', material: 'paint', color: C.paint, is_shell: true,
      function: '活塞在其中往复运动，两侧腔室交替吸气、压缩（双作用）。', description: '铸铁缸体内镶耐磨缸套，外层为冷却水套（两道加强筋）；内侧法兰用螺栓连接导向体，上下各两个气阀座。',
      position: [s * CYL_C, Y0, r.z], explode: [s * 1100, 0, 0],
      shapes: [
        P('lathe', { points: CYL_PROFILE, sharp: true }, [0, 0, 0], AX(s)),
        P('nut', NUT_L, [s * -301, 0, 0], AX(s), ring(12, 290, 'x', 15)),
        P('cylinder', { radius: 28, height: 70 }, [0, 0, r.z < 0 ? -330 : 330], AZ),
        P('flange', { radius: 48, thickness: 14, holes: 4 }, [0, 0, r.z < 0 ? -368 : 368], AZ),
      ],
    });
  }

  // ===== 活塞与活塞杆 =====
  for (const r of ROWS) {
    const { s } = r;
    add({
      id: `piston_${r.k}`, name: `${r.k} 列活塞与活塞杆`, name_en: `Piston & rod, row ${r.k}`, group: '活塞与活塞杆', material: 'aluminum', color: '#c3c9cf',
      function: '在气缸内往复运动压缩气体；活塞杆把十字头的推力传给活塞。', description: '铝合金活塞，3 道活塞环加支承环；活塞杆表面镀硬铬，穿过填料函密封。',
      position: [s * XP, Y0, r.z], explode: [0, 0, 0], motion: sliderOf(r),
      shapes: [
        P('cylinder', { radius: 40, height: ROD }, [s * ROD / 2, 0, 0], AX(s)),
        P('piston', { radius: 202, height: 200, rings: 3 }, [s * ROD, 0, 0], AX(s)),
      ],
    });
  }

  // ===== 气缸端盖 =====
  for (const r of ROWS) {
    const { s } = r;
    add({
      id: `head_${r.k}`, name: `${r.k} 列气缸端盖`, name_en: `Cylinder head, row ${r.k}`, group: '气缸端盖', material: 'paint', color: C.paintDark,
      function: '封闭气缸外端，形成外侧压缩腔。', description: '铸铁碟形端盖，12 颗螺母与缸体法兰压紧；中心为余隙调节器和手轮。',
      position: [0, Y0, r.z], explode: [s * 1500, 0, 0],
      shapes: [
        P('flange', { radius: 318, thickness: 50, holes: 0 }, [s * 1865, 0, 0], AX(s)),
        P('lathe', { points: DOME }, [s * 1890, 0, 0], AX(s)),
        P('nut', NUT_L, [s * 1901, 0, 0], AX(s), ring(12, 290, 'x', 15)),
        P('cylinder', { radius: 110, height: 70 }, [s * 2040, 0, 0], AX(s)),
        P('cylinder', { radius: 22, height: 120 }, [s * 2130, 0, 0], AX(s)),
        P('torus', { radius: 75, tube: 9 }, [s * 2185, 0, 0], AX(s)),
      ],
    });
  }

  // ===== 气阀组件 =====
  for (const side of SIDES) {
    const { s } = side;
    for (const pos of ['top', 'bottom']) {
      const d = pos === 'top' ? 1 : -1;
      add({
        id: `valves_${pos}_${side.en}`, name: `${pos === 'top' ? '顶部' : '底部'}气阀（${side.tag}）`, name_en: `${pos === 'top' ? 'Top' : 'Bottom'} valves`, group: '气阀组件',
        material: 'paint', color: '#4d5960',
        function: pos === 'top' ? '控制气缸一侧腔室的吸气和排气。' : '控制气缸另一侧腔室的吸气和排气（双作用气缸上下都有气阀）。',
        description: '环状阀片自动阀，阀盖用 6 颗螺母压紧，阀片和弹簧为易损件。',
        position: [0, 0, 0], explode: [s * 1100, d * 550, 0],
        shapes: side.rows.flatMap((r) => VALVES.flatMap((vx) => [
          P('cylinder', { radius: 85, height: 120 }, [s * vx, Y0 + d * 300, r.z]),
          P('flange', { radius: 96, thickness: 26, holes: 0 }, [s * vx, Y0 + d * 373, r.z]),
          P('nut', NUT_M, [s * vx, Y0 + d * 394, r.z], [0, 0, 0], ring(6, 74, 'y', 30)),
        ])),
      });
    }
  }

  // ===== 缓冲罐与管线 =====
  for (const side of SIDES) {
    const { s, zc } = side;
    const bottles = [
      { key: 'suction', name: '进气缓冲罐', en: 'Suction pulsation bottle', x: VALVES[0], r: 130, color: C.suction,
        fn: '稳定进气压力，削弱气流脉动，同时分离气体中的液滴。', desc: '卧式压力容器，椭圆封头，两端法兰接管。' },
      { key: 'discharge', name: '排气缓冲罐', en: 'Discharge pulsation bottle', x: VALVES[1], r: 115, color: C.discharge,
        fn: '接收各缸排出的高压气体，平稳输送到下游工艺管线。', desc: '外表面为橙色涂装，顶部设安全阀接口。' },
    ];
    for (const b of bottles) {
      const H = 1000;
      const tip = H + b.r * 0.5;
      const shapes = [
        P('lathe', { points: vessel(b.r, H) }, [0, 0, 0], AZ),
        P('cylinder', { radius: 55, height: 150 }, [0, 0, -(tip + 40)], AZ),
        P('cylinder', { radius: 55, height: 150 }, [0, 0, tip + 40], AZ),
      ];
      if (b.key === 'discharge') shapes.push(P('cylinder', { radius: 30, height: 110 }, [0, b.r + 40, 400]), P('flange', { radius: 55, thickness: 18, holes: 4 }, [0, b.r + 100, 400]));
      add({
        id: `${b.key}_bottle_${side.en}`, name: `${b.name}（${side.tag}）`, name_en: b.en, group: '缓冲罐与管线', material: 'paint', color: b.color,
        function: b.fn, description: b.desc,
        position: [s * b.x, BOTTLE_Y, zc], explode: [s * 1100, 1200, 0], shapes,
      });
    }
    add({
      id: `bottle_flanges_${side.en}`, name: `缓冲罐端部法兰（${side.tag}）`, name_en: 'Bottle end flanges', group: '缓冲罐与管线', material: 'steel', color: C.flange,
      function: '缓冲罐两端的工艺接管法兰，一端接工艺管线，另一端为盲板。', description: '对焊法兰 + 盲板，8 颗螺栓螺母紧固。',
      position: [0, BOTTLE_Y, zc], explode: [s * 1100, 1200, 0],
      shapes: bottles.flatMap((b) => {
        const z0 = b.r * 0.5 + 1000 + 115;
        return [-1, 1].flatMap((e) => [
          P('flange', { radius: 110, thickness: 30, holes: 0, innerRadius: 40 }, [s * b.x, 0, e * z0], AZ),
          P('flange', { radius: 110, thickness: 24, holes: 0 }, [s * b.x, 0, e * (z0 + 27)], AZ),
          P('nut', NUT_M, [s * b.x, 0, e * (z0 + 47)], AZ, ring(8, 88, 'z', 22.5)),
        ]);
      }),
    });
    add({
      id: `pipes_${side.en}`, name: `气阀连接短管（${side.tag}）`, name_en: 'Valve nozzles', group: '缓冲罐与管线', material: 'steel', color: '#76818a',
      function: '连接气缸顶部气阀与上方缓冲罐。', description: '每缸两根：一根通进气罐，一根通排气罐，中间法兰便于拆检。',
      position: [0, 0, 0], explode: [s * 1100, 800, 0],
      shapes: side.rows.flatMap((r) => [
        P('cylinder', { radius: 50, height: 180 }, [s * VALVES[0], 1222, r.z]),
        P('cylinder', { radius: 46, height: 195 }, [s * VALVES[1], 1230, r.z]),
        P('flange', { radius: 80, thickness: 16, holes: 6 }, [s * VALVES[0], 1205, r.z]),
        P('flange', { radius: 76, thickness: 16, holes: 6 }, [s * VALVES[1], 1205, r.z]),
      ]),
    });
  }

  // ===== 润滑系统 =====
  add({
    id: 'lubricator', name: '注油器', name_en: 'Cylinder lubricator', group: '润滑系统', material: 'paint', color: '#9aa4ab',
    function: '定量向气缸和填料注油润滑。', description: '多点柱塞式注油器，由曲轴通过链轮驱动。',
    position: [-300, 440, 1000], explode: [-600, 0, 900],
    shapes: [
      P('roundedBox', { width: 340, height: 260, depth: 220, radius: 16 }),
      P('roundedBox', { width: 360, height: 30, depth: 240, radius: 6 }, [0, 145, 0]),
      P('cylinder', { radius: 14, height: 110 }, [-120, 210, 0], [0, 0, 0], { count: 6, spacing: [48, 0, 0] }),
      P('cylinder', { radius: 40, height: 20 }, [0, 0, 120], AZ),
    ],
  });
  add({
    id: 'oil_pump', name: '油泵与滤油器', name_en: 'Oil pump & filters', group: '润滑系统', material: 'paint', color: '#5b6870',
    function: '为曲轴、连杆和十字头提供压力润滑油，并过滤杂质。', description: '齿轮油泵 + 双联可切换滤油器，运行中可单独更换滤芯。',
    position: [350, 400, 1050], explode: [600, 0, 900],
    shapes: [
      P('roundedBox', { width: 320, height: 200, depth: 240, radius: 14 }),
      P('cylinder', { radius: 60, height: 200 }, [-75, 200, 0]),
      P('cylinder', { radius: 60, height: 200 }, [75, 200, 0]),
      P('cylinder', { radius: 66, height: 26 }, [-75, 310, 0]),
      P('cylinder', { radius: 66, height: 26 }, [75, 310, 0]),
      P('cylinder', { radius: 22, height: 160 }, [0, 0, -180], AZ),
    ],
  });

  // 拆卸顺序：先拆外围管罐、上盖、气阀、端盖，再到气缸、活塞、运动件，最后是机身和底座
  const DIS = ['缓冲罐与管线', '上盖与检修盖', '气阀组件', '气缸端盖', '四缸气缸组件', '活塞与活塞杆', '填料与中间接筒', '润滑系统', '驱动电机', '曲轴箱与导向体', '连杆与十字头', '曲轴组件', '撬装底座'];
  [...parts].sort((a, b) => DIS.indexOf(a.group) - DIS.indexOf(b.group)).forEach((p, i) => { p.order = i + 1; });
  return parts;
}

export const RC04 = {
  object: {
    name: '石化四缸往复机',
    name_en: 'Petrochemical Reciprocating Compressor',
    category: '石化行业 · 往复式压缩机',
    summary: '卧式四列对称平衡型往复压缩机：四个双作用气缸两两对置布置在曲轴箱两侧，进、排气缓冲罐架在气缸上方，整机与驱动电机集成在撬装底座上，常用于炼化装置的氢气、天然气增压。',
    principle: '电机经联轴器带动四拐曲轴旋转，每拐通过连杆推动十字头在导向体内往复运动，十字头再经活塞杆带动气缸内的活塞。双作用气缸的两侧腔室交替吸气和压缩，气阀根据压差自动开闭；进气缓冲罐和排气缓冲罐削弱管道中的气流脉动。四个曲拐按 90° 错开，对置两列的往复惯性力相互抵消，整机振动小。',
    overall_size_mm: [4400, 1700, 3900],
    confidence: 0.85,
    assumptions: ['按 API 618 典型结构示意，尺寸为比例近似', '冷却水管路、仪表与工艺管线未建模', '气阀内部阀片未单独拆分'],
  },
  parts: build(),
};
