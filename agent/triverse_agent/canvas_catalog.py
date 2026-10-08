"""Clean-room skill text for OpenHands Canvas.

Directory names follow the installed skill catalog. The text is written for
this repository and tells the agent which Triverse or local tool to call.
"""

from __future__ import annotations

from pathlib import Path

ATOMIC_SKILLS = (
    "asset-page",
    "audio-mix",
    "ball-joint",
    "brep-build",
    "cad-sketch",
    "connector-select",
    "delivery-review",
    "exterior-surface",
    "eye-repair",
    "face-fit",
    "fit-coupon",
    "game-browser-check",
    "game-collision",
    "game-combat",
    "game-economy",
    "game-entitlement",
    "game-input",
    "game-level",
    "game-loop",
    "game-network",
    "game-package",
    "game-pool",
    "game-profile",
    "game-replay",
    "game-save",
    "game-score",
    "game-vehicle",
    "geometry-input",
    "glb-clips",
    "gray-resin",
    "grid-path",
    "head-reference",
    "head-template",
    "image-sheet",
    "landmark-project",
    "media-check",
    "media-edit",
    "media-encode",
    "mesh-audit",
    "model-preview",
    "motion-check",
    "motion-retarget",
    "nose-repair",
    "portrait-analysis",
    "print-export",
    "print-plan",
    "relief-map",
    "remotion-render",
    "replace-brief",
    "service-select",
    "shape-build",
    "skin-weights",
    "solid-edit",
    "source-prepare",
    "stroke-animate",
    "subtitle-track",
    "support-check",
    "surface-fit",
    "svg-edit",
    "taubin-smooth",
    "texture-bake",
    "video-sequence",
)

WORKFLOW_SKILLS = (
    "api-demo-service",
    "app-prototype",
    "articulated-sculpture",
    "asset-review-board",
    "audio-prep",
    "build-explorable-3d-game",
    "clip-edit",
    "cosplay-armor",
    "device-enclosure",
    "display-base",
    "earbud-case-cover",
    "exhibition-tour",
    "frame-design",
    "game-deploy",
    "hair-cards",
    "head-hair-split",
    "head-lowpoly",
    "game-demo",
    "model-animation",
    "image-to-assembly",
    "jewelry-reconstruction",
    "keychain",
    "lamp-design",
    "layered-laser-ornament",
    "mask-design",
    "mdf-deploy",
    "memory-scene",
    "metahuman-fit",
    "miniature-scene",
    "motion-base",
    "multiview-parts",
    "phone-case-relief",
    "portrait-reconstruction",
    "print-joints",
    "print-kit",
    "product-configurator",
    "product-design",
    "promo-layout",
    "relief-box",
    "relief-brush",
    "relief-palette",
    "rig-retarget",
    "scene-render",
    "screw-bottle",
    "sculpture-container",
    "summon-card-game",
    "teapot-design",
    "twisty-fidget",
    "vase-design",
    "water-feature",
)

_RULES = """
## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
""".strip()

_PRINT_GAP = "split 拆件、multicolor 多色、physical printer 真实打印机、watertight 水密修复尚未具备。"
_MODEL_TOOLS = "image_to_model、image_to_mesh、text_to_model、text_to_mesh、mesh_audit、scale_model、support_check、export_stl、export_3mf、blender_preview、model_preview_render。付费工具先报价。"


def _page(description: str, title: str, what: str, steps: str, tools: str, gaps: str) -> tuple[str, str, str]:
    if len(description) > 1024:
        raise ValueError(description[:80])
    body = f"{what.strip()}\n\n## 步骤\n{steps.strip()}\n\n## 工具\n{tools.strip()}\n\n## 做不到\n{gaps.strip()}\n\n{_RULES}\n"
    return description, title, body


def _product(subject: str) -> tuple[str, str, str]:
    return _page(
        f"当用户要做{subject}时使用。先报价生成模型，再在工作区检查尺寸、支撑并导出。",
        subject,
        f"目标是{subject}。把用户给出的尺寸、数量和不能出现的部分写进提示词，并记成 triverse- 说明。",
        """
1. 有一张参考图时调用 image_to_model；只要几何时调用 image_to_mesh。只有文字时调用 text_to_model 或 text_to_mesh。confirm 保持 false，把报价交给用户。
2. 结果进入工作区后调用 mesh_audit。需要指定尺寸时调用 scale_model。需要放稳时调用 support_check。
3. BLENDER_BIN 已设置时调用 blender_preview。没有设置就说明 Blender 未安装。用户同意后再报价 model_preview_render。
4. 需要加工文件时调用 export_stl 和 export_3mf。不要把文件发到打印机。
5. 用 write_workspace_note 记下所用文件、尺寸和检查结果。
""".strip(),
        _MODEL_TOOLS,
        _PRINT_GAP,
    )


def _relief(subject: str) -> tuple[str, str, str]:
    return _page(
        f"当用户要做{subject}时使用。浮雕服务尚未具备，只能在用户同意后做本地灰度位移体。",
        subject,
        f"用户要的是{subject}。relief 浮雕 / 深度服务尚未具备。不要把它说成已经完成的浮雕。",
        """
1. 先说明浮雕服务尚未具备。用户仍要一个本地高低形体时，调用 heightfield_mesh。有灰度图传 image，有数字阵列传 heights。
2. 用 scale_model 调到用户要求的毫米尺寸，再用 support_check 做几何估计。
3. 用 export_stl 和 export_3mf 写出文件。不要发送到打印机，也不要声称多色或分层加工已经完成。
4. 说明里写明这是本地灰度位移体，不是浮雕服务。
""".strip(),
        "heightfield_mesh、scale_model、support_check、mesh_audit、export_stl、export_3mf。",
        "relief 浮雕服务、multicolor 多色、physical printer 真实打印机尚未具备。",
    )


def _game(title: str, topic: str) -> tuple[str, str, str]:
    return _page(
        f"当用户要在工作区里实现{topic}时使用。写成可运行代码并亲自跑一次，不要假装已有游戏引擎。",
        title,
        f"这是{topic}的实现说明，不是现成库。",
        f"""
1. 用 list_workspace_files 看当前项目。没有项目时，在 workspace 里写一个小而能运行的{topic}。
2. 只做这件事。写出运行命令并实际执行，把结果或失败记到 triverse- 说明。
3. 需要三维资源时先报价 image_to_model 或 text_to_model。用户接受前 confirm 保持 false。网格先 mesh_audit。
4. 不要连接权益服务，不要打 Electron 包，不要声称游戏引擎已经部署。
""".strip(),
        "list_workspace_files、write_workspace_note、mesh_info、mesh_audit。资源生成用 image_to_model 或 text_to_model，先报价。",
        "真实游戏引擎、账号权益、Electron 桌面安装包尚未具备。",
    )


def _entries() -> dict[str, tuple[str, str, str]]:
    pages: dict[str, tuple[str, str, str]] = {}

    def add(name: str, item: tuple[str, str, str]) -> None:
        if name in pages:
            raise ValueError(f"duplicate {name}")
        pages[name] = item

    for name, subject in _PRODUCTS.items():
        add(name, _product(subject))
    for name, subject in _RELIEFS.items():
        add(name, _relief(subject))
    for name, (title, topic) in _GAMES.items():
        add(name, _game(title, topic))
    for name, item in _SPECS.items():
        add(name, item)
    add("triverse-canvas", _ROUTING)
    required = set(ATOMIC_SKILLS) | set(WORKFLOW_SKILLS) | {"triverse-canvas"}
    missing = sorted(required - set(pages))
    extra = sorted(set(pages) - required)
    if missing or extra:
        raise RuntimeError(f"missing={missing} extra={extra}")
    overlap = sorted(set(ATOMIC_SKILLS) & set(WORKFLOW_SKILLS))
    if overlap:
        raise RuntimeError(f"overlap={overlap}")
    return pages


_PRODUCTS = {
    "articulated-sculpture": "可动雕塑",
    "cosplay-armor": "角色护甲外形",
    "device-enclosure": "设备外壳",
    "display-base": "展示底座",
    "earbud-case-cover": "耳机盒外壳",
    "exhibition-tour": "展览空间模型",
    "frame-design": "画框或边框",
    "jewelry-reconstruction": "饰品外形",
    "keychain": "钥匙扣",
    "lamp-design": "灯具外形",
    "mask-design": "面具外形",
    "memory-scene": "纪念场景模型",
    "miniature-scene": "微缩场景",
    "motion-base": "运动底座",
    "product-design": "产品外形",
    "scene-render": "场景模型和预览图",
    "screw-bottle": "带旋盖的瓶子",
    "sculpture-container": "雕塑容器",
    "teapot-design": "茶壶",
    "twisty-fidget": "扭转玩具",
    "vase-design": "花瓶",
    "water-feature": "水景摆件",
}

_RELIEFS = {
    "layered-laser-ornament": "分层轮廓饰品",
    "phone-case-relief": "手机壳表面高低",
    "relief-box": "盒子表面高低",
    "relief-brush": "笔刷状高低纹样",
    "relief-map": "由灰度图得到的高低形体",
    "relief-palette": "调色板形高低形体",
}

_GAMES = {
    "game-browser-check": ("浏览器试玩检查", "浏览器里打开、操作和结束一次试玩"),
    "game-collision": ("碰撞", "碰撞体和碰撞响应"),
    "game-combat": ("战斗循环", "攻击、受击和胜负"),
    "game-economy": ("经济数值", "资源、价格和消耗"),
    "game-input": ("输入映射", "键鼠或触控到动作的映射"),
    "game-level": ("关卡", "关卡布局和通关条件"),
    "game-loop": ("主循环", "更新、绘制和退出"),
    "game-network": ("对局同步", "本地可测的状态同步"),
    "game-package": ("本地打包", "把项目文件打成普通压缩包"),
    "game-pool": ("对象池", "可复用对象池"),
    "game-profile": ("档案数据", "玩家档案的读写"),
    "game-replay": ("录像回放", "操作记录和重放"),
    "game-save": ("存档", "存档和读档"),
    "game-score": ("计分", "分数和结算"),
    "game-vehicle": ("载具", "载具移动"),
    "app-prototype": ("应用原型", "可点击的小原型"),
    "build-explorable-3d-game": ("可探索三维原型", "能在场景里移动和碰撞的小原型"),
    "game-deploy": ("本地试运行", "在工作区里启动并检查原型"),
    "game-demo": ("三维演示原型", "用工作区模型和本地代码做的演示"),
    "product-configurator": ("参数选择原型", "用参数切换模型或颜色的页面"),
    "summon-card-game": ("召唤卡牌原型", "抽卡、出场和结算的小规则"),
}

_SPECS: dict[str, tuple[str, str, str]] = {
    "api-demo-service": _page(
        "当用户要一个演示服务或接口示例时使用。只在工作区写代码，也不把密钥写进文件。",
        "接口演示",
        "做一个读得到、跑得起来的本地演示。不要把 Triverse 或对话密钥写进仓库、脚本或说明。",
        """
1. 在 workspace 里写一个小示例，并写明怎么运行。
2. 实际运行一次。失败就保留错误输出。
3. 若演示需要真实三维任务，先报价，等用户接受后再把 confirm 设为 true。
""".strip(),
        "list_workspace_files、write_workspace_note。真实三维任务用对应的 Triverse 工具并先报价。",
        "MDF、账号权益尚未具备。",
    ),
    "asset-page": _page(
        "当用户要整理模型交付页、资产清单或检查图册时使用。",
        "资产页",
        "把当前工作区里的模型和图片整理成一份可读说明，不重新生成模型。",
        """
1. 调用 list_workspace_files。对每个网格调用 mesh_audit。
2. 图片多于一张时调用 image_sheet。BLENDER_BIN 已设置时对主模型调用 blender_preview。
3. 用 write_workspace_note 写出文件名、面数、检查结果和仍缺的项。
""".strip(),
        "list_workspace_files、mesh_audit、image_sheet、blender_preview、write_workspace_note。",
        "不会生成新的远程模型，除非用户另外要求并接受报价。",
    ),
    "asset-review-board": _page(
        "当用户要评审一批已有模型是否能交付时使用。先诊断，不自动重做。",
        "资产评审",
        "对工作区里已有的模型做交付检查。",
        """
1. list_workspace_files 后，对每个网格调用 mesh_audit 和 support_check。
2. 需要尺寸时只报告 mesh_info 的包围盒，不擅自 scale_model。
3. 把边界、非流形、退化和支撑估计写成 triverse- 评审说明。闭合检查不是水密修复。
""".strip(),
        "list_workspace_files、mesh_info、mesh_audit、support_check、write_workspace_note。",
        "watertight 水密修复、split 拆件尚未具备。",
    ),
    "audio-mix": _page(
        "当用户要把两段工作区音频混成一条时使用。",
        "混音",
        "只用本机 ffmpeg 混合两路音频。",
        """
1. 先对两个输入调用 media_probe。ffprobe 不可用就说明未安装。
2. 调用 media_convert，kind 为 mix_audio，inputs 正好两个，output 放在工作区。
3. 不对用户提供的滤镜字符串原样执行。
""".strip(),
        "media_probe、media_convert。",
        "没有独立的调音台或自动配乐服务。",
    ),
    "audio-prep": _page(
        "当用户要检查并整理音频，再裁切或混音时使用。",
        "音频准备",
        "先探测，再按用户指定的秒数裁切或混合。",
        """
1. 对每个文件调用 media_probe，记下时长和编码。
2. 用户给了起止秒时，media_convert 的 kind 用 trim。两路混合时 kind 用 mix_audio。
3. 不要发明用户没给的时间范围。
""".strip(),
        "media_probe、media_convert。",
        "不做语音识别，也不生成新的音乐。",
    ),
    "ball-joint": _page(
        "当用户要设计球窝关节的网格时使用。可以布尔或生成外形，但不能发送到打印机。",
        "球窝关节",
        "球窝关节只做到网格和导出。物理配合要由用户自己试装。",
        """
1. 已有两个网格时，BLENDER_BIN 已设置就用 mesh_boolean 做 union 或 difference。未设置就说明 Blender 未安装。
2. 没有网格时，先报价 text_to_mesh 或 image_to_mesh，把球径和间隙写进提示词。
3. 用 scale_model 调到用户给的毫米，再 export_stl 和 export_3mf。
""".strip(),
        "mesh_boolean、text_to_mesh、image_to_mesh、scale_model、export_stl、export_3mf。",
        "physical printer 真实打印机、自动公差验证尚未具备。",
    ),
    "brep-build": _page(
        "当用户要 STEP、B-rep 或 CadQuery 实体时使用。先说明实体内核尚未具备。",
        "实体建模",
        "STEP / CadQuery B-rep 尚未具备。不要把三角网格叫成实体模型。",
        """
1. 直接说明没有实体内核，不能写出 STEP 或可编辑的 B-rep。
2. 用户改要三角网格时，才报价 text_to_mesh 或 image_to_mesh，并标明结果是网格。
""".strip(),
        "用户改要网格后才用 text_to_mesh 或 image_to_mesh，并先报价。",
        "STEP / CadQuery B-rep 尚未具备。",
    ),
    "cad-sketch": _page(
        "当用户要改二维草图或轮廓时使用。没有 CAD 内核，只编辑工作区里的文本或 SVG。",
        "草图",
        "把草图当成工作区里的 SVG 或文本，不用实体内核。",
        """
1. 找到用户指出的 SVG 或文本。没有就新建 triverse-sketch.svg，只含用户描述的简单形状。
2. 修改后把路径和改动写进说明。
3. 用户要三维时再报价，不把草图自动升成 B-rep。
""".strip(),
        "list_workspace_files、write_workspace_note。三维用 text_to_mesh，先报价。",
        "STEP / CadQuery B-rep 尚未具备。",
    ),
    "clip-edit": _page(
        "当用户要按秒裁视频或音频时使用。",
        "片段裁切",
        "只按用户给出的起止时间裁切一个文件。",
        """
1. media_probe 确认文件和时长。
2. media_convert 的 kind 用 trim，start 和 end 用用户的秒数。
3. 没有起止时间就询问，不要猜。
""".strip(),
        "media_probe、media_convert。",
        "remotion 尚未具备。不做自动剪辑。",
    ),
    "connector-select": _page(
        "当用户要比较连接件并选出一种外形时使用。先写比较，再按选择生成网格。",
        "连接件",
        "根据用户给的尺寸和受力方向写一份比较，不假装有标准件库。",
        """
1. 用 write_workspace_note 列出用户提到的连接方式、配合尺寸和取舍。
2. 用户选定后，报价 text_to_mesh 或 image_to_mesh。
3. 用 scale_model 调尺寸，export_3mf 导出。不要发到打印机。
""".strip(),
        "write_workspace_note、text_to_mesh、image_to_mesh、scale_model、export_3mf。",
        "没有标准件库。physical printer 尚未具备。",
    ),
    "delivery-review": _page(
        "当用户要在交付前检查网格、支撑和文件是否齐全时使用。",
        "交付检查",
        "只做检查和说明，不自动修复。",
        """
1. mesh_audit 看边界、非流形和退化。support_check 看 Z 轴向上的几何估计。
2. 需要加工文件时确认 export_stl 和 export_3mf 的输出已经在工作区。
3. 把未通过的项写成说明。不要把诊断说成水密修复。
""".strip(),
        "mesh_audit、support_check、list_workspace_files、export_stl、export_3mf。",
        "watertight 水密修复和 physical printer 尚未具备。",
    ),
    "exterior-surface": _page(
        "当用户要改模型外表面的颜色或贴图时使用。远程贴图先报价，本地烘焙只产法线。",
        "外表面",
        "外表面要么走 Triverse 贴图，要么在本地烘焙法线。两者不要混称。",
        """
1. 有参考图时报价 texture_model。只有文字时报价 text_to_texture，model_url 必须是公网 URL。
2. 用户只要本地法线、且 BLENDER_BIN 已设置时，调用 texture_bake。未安装就说明。
3. 不要把本地法线 PNG 说成彩色贴图已经完成。
""".strip(),
        "texture_model、text_to_texture、texture_bake。付费工具先报价。",
        "multicolor 多色打印尚未具备。texture_bake 不是远程贴图。",
    ),
    "eye-repair": _page(
        "当用户要修复人像眼睛时使用。没有专门的眼睛修复器。",
        "眼睛",
        "没有自动眼睛修复。不要声称眼睛已经被修好。",
        """
1. 说明没有眼睛修复服务，也没有 sapiens 人体关键点。
2. 用户同意重做整头时，用一张参考图报价 image_to_model。不要传多视图。
3. 结果只用 mesh_audit 检查，不宣称局部已经修复。
""".strip(),
        "image_to_model、mesh_audit。先报价。",
        "sapiens、自动眼睛修复、multiview 多视图尚未具备。",
    ),
    "face-fit": _page(
        "当用户要把已有人头或面具缩放到指定尺寸时使用。不做绑骨。",
        "面部尺寸",
        "只缩放和检查现有网格。",
        """
1. mesh_info 读当前包围盒。
2. 用户给了目标毫米时调用 scale_model，axis 用用户指定的轴。
3. mesh_audit 复核。不要做 auto-rig 或 sapiens 对齐。
""".strip(),
        "mesh_info、scale_model、mesh_audit。",
        "auto-rig 自动绑骨、sapiens 尚未具备。",
    ),
    "fit-coupon": _page(
        "当用户要核对模型是否落在给定尺寸范围内时使用。",
        "尺寸核对",
        "用包围盒和缩放做尺寸核对，不生产实物试样。",
        """
1. mesh_info 读三轴尺寸，按网格单位理解，不假装已经测量过实物。
2. 用户要求改到某一轴的毫米值时调用 scale_model。
3. 把目标、结果和是否越界写入说明。
""".strip(),
        "mesh_info、scale_model、write_workspace_note。",
        "没有实物量具，也没有打印机。",
    ),
    "game-entitlement": _page(
        "当用户要查询或发放账号权益、许可或资格时使用。直接说明尚未具备。",
        "权益",
        "账号权益尚未具备。不要编造许可结果。",
        """
1. 说明这里没有权益接口。
2. 不要根据本地文件判断用户是否已购买。
3. 三维生成只使用 Triverse 报价，不把报价说成权益。
""".strip(),
        "无权益工具。",
        "账号权益尚未具备。",
    ),
    "geometry-input": _page(
        "当用户要把网格或图片放进工作区并确认文件可读时使用。",
        "几何输入",
        "只接收工作区相对路径。拒绝越出工作区的路径。",
        """
1. 用 list_workspace_files 确认文件在 workspace 内。
2. 网格调用 mesh_info。图片可以 media_probe。
3. 路径含 .. 或绝对路径时停止并说明，不要读工作区外的文件。
""".strip(),
        "list_workspace_files、mesh_info、media_probe。",
        "不从工作区外取文件。",
    ),
    "glb-clips": _page(
        "当用户要查看 GLB 里有没有动画片段时使用。不重定向骨骼。",
        "GLB 片段",
        "只检查现有 GLB。没有重定向库。",
        """
1. 确认文件在工作区且扩展名是 glb 或 gltf。
2. 用工作区内的一段 Python 读取文件里的动画名字。读不到就说明未发现片段。
3. 不要调用 motion-retarget，也不要声称已经绑骨。
""".strip(),
        "list_workspace_files、mesh_info。",
        "auto-rig 自动绑骨和动作重定向尚未具备。",
    ),
    "gray-resin": _page(
        "当用户要看灰模或素模预览时使用。这不是树脂打印。",
        "灰模预览",
        "灰模只是预览颜色，不是灰树脂材料和打印机。",
        """
1. BLENDER_BIN 已设置时调用 blender_preview。未设置就说明 Blender 未安装。
2. 用户要服务端图片时再报价 model_preview_render。
3. 不要把预览图说成已经用树脂打印。
""".strip(),
        "blender_preview、model_preview_render。付费渲染先报价。",
        "physical printer 尚未具备。",
    ),
    "grid-path": _page(
        "当用户要在网格上求一条可行路径时使用。在工作区写代码并跑测试。",
        "网格路径",
        "用工作区代码做网格寻路，不调用三维生成。",
        """
1. 按用户给的障碍和起终点写一个小程序。
2. 运行它，把路径或无解结果写入说明。
3. 不要把寻路结果说成导航硬件或游戏引擎已经接入。
""".strip(),
        "write_workspace_note，以及工作区里的代码。",
        "真实游戏引擎尚未具备。",
    ),
    "hair-cards": _page(
        "当用户要把头发拆成卡片网格时使用。拆件尚未具备。",
        "头发卡片",
        "split 拆件尚未具备。不能自动把头发切成卡片。",
        """
1. 说明不能自动拆出发片。
2. 用户同意生成整头时，用一张参考图报价 image_to_model，并说明头发和头是同一个模型。
3. 用 mesh_audit 检查整体，不要声称卡片已经分离。
""".strip(),
        "image_to_model、mesh_audit。先报价。",
        "split 拆件、auto-rig 尚未具备。",
    ),
    "head-hair-split": _page(
        "当用户要把头和头发分成两个模型时使用。拆件尚未具备。",
        "头和头发",
        "split 拆件尚未具备。",
        """
1. 说明不能把头和头发自动拆开。
2. 可以报价生成一个包含两者的模型，或让用户分别提供两张图各生成一次。
3. 每次生成都单独报价。不要用多视图参数。
""".strip(),
        "image_to_model、mesh_audit。先报价。",
        "split 拆件、multiview 多视图尚未具备。",
    ),
    "head-lowpoly": _page(
        "当用户要把头模型减到指定面数时使用。远程重网格先报价，没有 LOD 链。",
        "低面数头模",
        "减面走 model_remesh。LOD 尚未具备。",
        """
1. 先 mesh_info 看当前面数。
2. 报价 model_remesh，target_face_count 用用户的数字，face_type 用 triangle 或用户指定的 quad。
3. 完成后再次 mesh_info。不要声称生成了多级 LOD。
""".strip(),
        "mesh_info、model_remesh。先报价。",
        "LOD 尚未具备。",
    ),
    "head-reference": _page(
        "当用户要凭一张头部参考图生成模型时使用。只有单图，没有多视图。",
        "头部参考",
        "一张图生成一个头。multiview 多视图尚未具备。",
        """
1. 确认参考图在工作区。报价 image_to_model，或只要几何时报价 image_to_mesh。
2. 不要附加第二张图当多视图。
3. 结果 mesh_audit。眼睛或鼻子没有单独修复器。
""".strip(),
        "image_to_model、image_to_mesh、mesh_audit。先报价。",
        "multiview、sapiens、自动五官修复尚未具备。",
    ),
    "head-template": _page(
        "当用户要从已有头模改尺寸或检查时使用。不生成新头，除非用户另外要求。",
        "头模模板",
        "以工作区里的头模为起点做缩放和诊断。",
        """
1. mesh_audit 现有文件。
2. 按用户的毫米值 scale_model。
3. 需要新头时才报价，并说明这是另一次生成。
""".strip(),
        "mesh_audit、scale_model、image_to_model。",
        "split 拆件和 auto-rig 尚未具备。",
    ),
    "model-animation": _page(
        "当用户要把模型做成动画时使用。没有自动绑骨和重定向。",
        "模型动画",
        "auto-rig 自动绑骨尚未具备。可以做静态模型和图片序列。",
        """
1. 说明不能自动绑骨，也不能把动作套到骨骼上。
2. 需要静态模型时按普通流程报价。
3. 已有图片序列时可以用 media_convert 的 images_to_mp4。不要声称骨骼动画已经完成。
""".strip(),
        "text_to_model、image_to_model、media_convert。付费工具先报价。",
        "auto-rig、动作重定向、remotion 尚未具备。",
    ),
    "image-sheet": _page(
        "当用户要把多张工作区图片拼成一张检查图时使用。",
        "图片拼图",
        "用 ffmpeg 把 1 到 12 张图拼起来。",
        """
1. 确认每张图都在工作区。
2. 调用 image_sheet。columns 用 1 到 6，默认 2。
3. ffmpeg 不可用时说明未安装，不要编造拼图。
""".strip(),
        "image_sheet。",
        "超过 12 张要分批。没有版式设计服务。",
    ),
    "image-to-assembly": _page(
        "当用户要把一张图拆成多个零件时使用。拆件尚未具备。",
        "图生装配",
        "split 拆件尚未具备。一张图只会得到一个模型。",
        """
1. 说明不能自动拆成装配体。
2. 用户仍要整体外形时，报价 image_to_model 或 image_to_mesh。
3. 结果 mesh_audit，并写明这是单件网格。
""".strip(),
        "image_to_model、image_to_mesh、mesh_audit。先报价。",
        "split 拆件、multiview 尚未具备。",
    ),
    "landmark-project": _page(
        "当用户要人体关键点或 sapiens 投影时使用。直接说明尚未具备。",
        "关键点",
        "sapiens 人体关键点尚未具备。",
        """
1. 说明没有关键点检测。
2. 不要用网格顶点冒充关节。
3. 用户改要整个人体模型时再单独报价。
""".strip(),
        "无关键点工具。",
        "sapiens 尚未具备。",
    ),
    "mdf-deploy": _page(
        "当用户要部署 MDF 模块时使用。直接说明尚未具备。",
        "MDF",
        "MDF 尚未具备。不要寻找未列出的部署接口。",
        """
1. 说明没有 MDF 运行时。
2. 用户改要普通本地脚本时，在 workspace 里写并运行。
3. 不要把密钥写进示例。
""".strip(),
        "无 MDF 工具。本地脚本只用工作区文件。",
        "MDF 尚未具备。",
    ),
    "media-check": _page(
        "当用户要查看视频、音频或图片的编码和时长时使用。",
        "媒体检查",
        "用 ffprobe 读取工作区文件。",
        """
1. 调用 media_probe。
2. available 为 false 时说明 ffprobe 未安装。
3. 不要在探测失败时编造时长。
""".strip(),
        "media_probe。",
        "探测失败就停止，不改文件。",
    ),
    "media-edit": _page(
        "当用户要裁切或缩放工作区里的视频、音频时使用。",
        "媒体裁剪",
        "只做 trim 和 scale 两种 ffmpeg 操作。",
        """
1. media_probe 确认输入。
2. 裁切用 media_convert kind=trim。缩放用 kind=scale，宽高在 2 到 4096。
3. 不接受用户写的任意滤镜串。
""".strip(),
        "media_probe、media_convert。",
        "remotion 尚未具备。",
    ),
    "media-encode": _page(
        "当用户要把图片序列或媒体写成新文件时使用。",
        "媒体编码",
        "用限定的 ffmpeg 操作写出新文件。",
        """
1. 图片序列用 media_convert kind=images_to_mp4，fps 为 1 到 60。
2. 缩放或裁切按用户参数选择 scale 或 trim。
3. 输出必须留在工作区。失败时返回 ffmpeg 的错误，不报成功。
""".strip(),
        "media_convert、media_probe。",
        "不提供任意编码器参数面板。",
    ),
    "mesh-audit": _page(
        "当用户要诊断网格是否有边界、非流形或退化面时使用。",
        "网格诊断",
        "mesh_audit 只读，不修改网格。",
        """
1. 调用 mesh_audit。
2. 向用户报告边界边、非流形边、退化面、连通块和 closed。
3. 说明 closed 不是 watertight 水密修复。
""".strip(),
        "mesh_audit。",
        "watertight 水密修复尚未具备。",
    ),
    "metahuman-fit": _page(
        "当用户要把模型配成 MetaHuman 时使用。直接说明尚未具备。",
        "MetaHuman",
        "MetaHuman 尚未具备。不要导出它的绑定或控制器。",
        """
1. 说明没有 MetaHuman 适配器。
2. 可以报价生成普通人体网格，但必须标明不是 MetaHuman。
3. 不要做 auto-rig。
""".strip(),
        "用户改要普通网格时用 image_to_model 或 text_to_model，先报价。",
        "MetaHuman、auto-rig、sapiens 尚未具备。",
    ),
    "model-preview": _page(
        "当用户要从已有网格得到前后左右预览图时使用。本地和工作室渲染是两条路。",
        "模型预览",
        "本地用 Blender Workbench。远程渲染要报价。",
        """
1. BLENDER_BIN 已设置时调用 blender_preview，得到 front、back、left、right。
2. 未设置就说明 Blender 未安装。用户要服务端图时报价 model_preview_render。
3. multi_angle 只是相机角度，不是 multiview 建模。
""".strip(),
        "blender_preview、model_preview_render。",
        "multiview 建模尚未具备。",
    ),
    "motion-check": _page(
        "当用户要检查动作文件或 GLB 动画是否存在时使用。不重定向。",
        "动作检查",
        "只报告工作区里能读到的动作信息。",
        """
1. 列出相关文件。GLB 按 glb-clips 的方法读动画名。
2. 读不到就说明没有发现可检查的动作。
3. 不要修改骨骼，也不要生成新动作。
""".strip(),
        "list_workspace_files、mesh_info。",
        "动作重定向和 auto-rig 尚未具备。",
    ),
    "motion-retarget": _page(
        "当用户要把动作重定向到另一个模型时使用。直接说明尚未具备。",
        "动作重定向",
        "没有重定向库，auto-rig 也尚未具备。",
        """
1. 说明不能把动作套到另一套骨骼上。
2. 可以检查源文件里有没有动画名。
3. 不要用 Blender 脚本假装重定向已经完成，除非用户自己提供并确认过脚本，且结果要标明未验证。
""".strip(),
        "list_workspace_files。",
        "动作重定向、auto-rig 尚未具备。",
    ),
    "multiview-parts": _page(
        "当用户要用多张视图一起建模或拆零件时使用。两项都尚未具备。",
        "多视图零件",
        "multiview 多视图一起建模和 split 拆件都尚未具备。",
        """
1. 说明不能把多张视图合成一个模型，也不能自动拆件。
2. 用户改用一张图时，报价一次 image_to_model 或 image_to_mesh。
3. 不要把其余图片当作额外视角参数。
""".strip(),
        "image_to_model、image_to_mesh。先报价。",
        "multiview、split 尚未具备。",
    ),
    "nose-repair": _page(
        "当用户要单独修复鼻子时使用。没有局部修复器。",
        "鼻子",
        "没有鼻子修复服务。",
        """
1. 说明不能只改鼻子。
2. 用户同意重做时，用一张参考图报价 image_to_model。
3. 用 mesh_audit 看整体，不宣称鼻子已经修复。
""".strip(),
        "image_to_model、mesh_audit。先报价。",
        "自动五官修复、sapiens 尚未具备。",
    ),
    "portrait-analysis": _page(
        "当用户要分析人像照片时使用。没有人体关键点检测。",
        "人像分析",
        "可以描述用户给出的可见信息。sapiens 尚未具备。",
        """
1. 说明没有关键点、年龄或身份识别服务。
2. 只根据用户提供的图片和问题作描述，不编造测量值。
3. 要生成头模时改走 head-reference，并先报价。
""".strip(),
        "无关键点工具。生成时用 image_to_model，先报价。",
        "sapiens 尚未具备。",
    ),
    "portrait-reconstruction": _page(
        "当用户要用照片重建头像模型时使用。只支持单张图。",
        "头像重建",
        "单图生成头模。多视图、关键点和自动修脸都没有。",
        """
1. 选用一张参考图，报价 image_to_model。只要几何时用 image_to_mesh。
2. 不要把其余照片当作 multiview。
3. 完成后 mesh_audit。眼睛、鼻子没有单独修复步骤。
""".strip(),
        "image_to_model、image_to_mesh、mesh_audit。先报价。",
        "multiview、sapiens、自动五官修复尚未具备。",
    ),
    "print-export": _page(
        "当用户要导出可加工的网格文件时使用。只写 STL 和 3MF，不连接打印机。",
        "打印导出",
        "导出停在工作区文件。",
        """
1. 先 mesh_audit。
2. 调用 export_stl 和 export_3mf。3MF 单位按毫米写入。
3. 告诉用户文件路径，并说明没有发送到 physical printer。
""".strip(),
        "mesh_audit、export_stl、export_3mf。",
        "physical printer 真实打印机尚未具备。",
    ),
    "print-joints": _page(
        "当用户要做可打印的关节件时使用。导出文件，不发送打印。",
        "关节打印件",
        "关节只做到缩放、估计和导出。",
        """
1. 没有模型时先报价 text_to_mesh，把关节尺寸写进提示词。
2. scale_model 到用户的毫米，support_check 作几何估计。
3. export_stl 和 export_3mf。说明这不是实物配合证明。
""".strip(),
        "text_to_mesh、scale_model、support_check、export_stl、export_3mf。",
        "physical printer、自动公差验证尚未具备。",
    ),
    "print-kit": _page(
        "当用户要导出一套加工文件时使用。逐个导出，不拆件，不发送打印机。",
        "加工套件",
        "套件里的每个网格单独导出。不能自动拆成零件。",
        """
1. list_workspace_files，对每个网格 mesh_audit、scale_model（仅当用户给了尺寸）和 support_check。
2. 每个文件 export_stl 与 export_3mf。
3. 写一份清单。split 拆件尚未具备，不要从一个模型变出多个零件。
""".strip(),
        "list_workspace_files、mesh_audit、scale_model、support_check、export_stl、export_3mf。",
        "split、physical printer、multicolor 尚未具备。",
    ),
    "print-plan": _page(
        "当用户要规划加工尺寸和支撑时使用。只做几何估计和导出。",
        "加工计划",
        "计划包含尺寸、支撑估计和文件路径，不包含打印机指令。",
        """
1. scale_model 到用户指定的轴和毫米。
2. support_check。说明这不是摩擦或实物抗倾倒证明。
3. export_3mf 和 export_stl，把结果写入说明。
""".strip(),
        "scale_model、support_check、export_3mf、export_stl、mesh_audit。",
        "physical printer 尚未具备。",
    ),
    "promo-layout": _page(
        "当用户要宣传图或把多张图排成一版时使用。生图先报价，拼图走本地 ffmpeg。",
        "宣传排版",
        "新图要报价。已有图用 image_sheet 排列。",
        """
1. 需要新画面时报价 image_generation。
2. 已有 1 到 12 张图时调用 image_sheet。
3. 把输出路径写入说明。不要调用不存在的排版服务。
""".strip(),
        "image_generation、image_sheet。生图先报价。",
        "没有印刷厂接口。",
    ),
    "remotion-render": _page(
        "当用户要 Remotion 渲染时使用。直接说明尚未具备，改走 ffmpeg。",
        "Remotion",
        "remotion 尚未具备。",
        """
1. 说明没有 Remotion 运行时。
2. 已有图片序列时用 media_convert 的 images_to_mp4。
3. 已有成片时只用 trim 或 scale。
""".strip(),
        "media_convert、media_probe。",
        "remotion 尚未具备。",
    ),
    "replace-brief": _page(
        "当用户要写一份替换说明或修改简报时使用。",
        "替换简报",
        "把要替换的对象、保留项和禁止项写成工作区说明。",
        """
1. 用 write_workspace_note 写简报，包含输入文件、希望保留的部分和不要出现的部分。
2. 用户确认要重新生成时再报价对应工具。
3. 不要在写简报这一步创建付费任务。
""".strip(),
        "write_workspace_note、list_workspace_files。",
        "简报本身不修改模型。",
    ),
    "rig-retarget": _page(
        "当用户要绑骨或把动作重定向到模型时使用。直接说明尚未具备。",
        "绑骨重定向",
        "auto-rig 自动绑骨和动作重定向尚未具备。",
        """
1. 说明不能创建骨架，也不能迁移权重。
2. 可以保留静态模型，并用 mesh_audit 检查。
3. 不要把蒙皮权重写成已经可用。
""".strip(),
        "mesh_audit、list_workspace_files。",
        "auto-rig、skin weights 迁移、MetaHuman 尚未具备。",
    ),
    "service-select": _page(
        "当用户的请求可能对应多个工具或一个缺口时使用。先选路，再调用。",
        "能力选择",
        "按下面的对应关系选择，不要发明接口。",
        """
1. 单图带贴图用 image_to_model，单图只要几何用 image_to_mesh，艺术网格用 image_to_artistic_mesh。
2. 纯文字用 text_to_model 或 text_to_mesh。贴图用 texture_model 或 text_to_texture。重网格用 model_remesh。格式用 convert_model_format。远程预览用 model_preview_render。
3. 平面图用 image_generation。提示词用 prompt_optimize。以上都先报价。
4. 本地网格用 mesh_info、mesh_audit、taubin_smooth、scale_model、export_stl、export_3mf、heightfield_mesh、support_check。
5. 媒体用 media_probe 和 media_convert。Blender 工具只在 BLENDER_BIN 已设置时使用。
6. multiview 多视图、浮雕服务、拆件、多色、自动绑骨、水密修复、LOD、sapiens、打印机、Electron、权益、MDF、STEP、remotion、MetaHuman、真实游戏引擎都回答尚未具备。
""".strip(),
        "只调用上表点名的工具。",
        "表里标成尚未具备的项目不要用别的工具冒充。",
    ),
    "shape-build": _page(
        "当用户要用简单形体或高度图做网格时使用。",
        "形体",
        "简单高低形体走 heightfield_mesh。复杂外形先报价。",
        """
1. 用户给了高度数组或灰度图时调用 heightfield_mesh，并说明这不是浮雕服务。
2. 需要任意物体外形时报价 text_to_mesh 或 image_to_mesh。
3. 之后可以 scale_model 和 export_stl。
""".strip(),
        "heightfield_mesh、text_to_mesh、image_to_mesh、scale_model、export_stl。",
        "STEP 实体和 relief 浮雕服务尚未具备。",
    ),
    "skin-weights": _page(
        "当用户要蒙皮权重时使用。直接说明尚未具备。",
        "蒙皮权重",
        "没有自动绑骨，也不能写入可用的蒙皮权重。",
        """
1. 说明 auto-rig 尚未具备。
2. 不要生成一份看起来像权重的随机数据。
3. 静态网格仍可用 mesh_audit 检查。
""".strip(),
        "mesh_audit。",
        "auto-rig 自动绑骨尚未具备。",
    ),
    "solid-edit": _page(
        "当用户要对两个网格做并、差或交时使用。需要本机 Blender。",
        "网格布尔",
        "布尔是网格操作，不是实体内核。",
        """
1. 确认两个输入都在工作区。operation 只能是 difference、union 或 intersect。
2. BLENDER_BIN 已设置时调用 mesh_boolean。未设置就说明 Blender 未安装。
3. 成功后 mesh_audit 输出。不要把结果叫成 STEP。
""".strip(),
        "mesh_boolean、mesh_audit。",
        "STEP / CadQuery B-rep 尚未具备。",
    ),
    "source-prepare": _page(
        "当用户要在生成前检查参考图或模型是否在工作区时使用。",
        "素材准备",
        "先确认输入，再决定是否报价。",
        """
1. list_workspace_files。图片用 media_probe，网格用 mesh_info。
2. 文件缺失就停下来要路径。不要找工作区外的文件。
3. 输入确认后，按用户目标报价对应的生成工具。
""".strip(),
        "list_workspace_files、media_probe、mesh_info。",
        "不在准备阶段创建付费任务。",
    ),
    "stroke-animate": _page(
        "当用户要把笔画或图片序列收成视频时使用。没有 Remotion。",
        "笔画动画",
        "remotion 尚未具备。图片序列可以合成 MP4。",
        """
1. 说明没有 Remotion，也不能从一张图自动生成笔画动画。
2. 用户已经有按顺序命名的图片时，调用 media_convert kind=images_to_mp4。
3. 需要字幕时另外调用 write_subtitle，不做语音识别。
""".strip(),
        "media_convert、write_subtitle。",
        "remotion 尚未具备。",
    ),
    "subtitle-track": _page(
        "当用户给出了字幕时间和文本、要写成 SRT 时使用。",
        "字幕",
        "只把用户给的时间轴写成文件。",
        """
1. 每条需要 start、end（秒）和 text。调用 write_subtitle。
2. 没有时间或文本时询问，不要听写音频。
3. 说明不做语音识别。
""".strip(),
        "write_subtitle。",
        "自动听写尚未具备。",
    ),
    "support-check": _page(
        "当用户要估计模型按 Z 轴向上是否站得住时使用。",
        "支撑估计",
        "这是底面接触点的几何估计。",
        """
1. 调用 support_check。
2. 报告 stable_estimate、margin_mm 和 note。
3. 说明它不证明摩擦、填充或实物抗倾倒。
""".strip(),
        "support_check。",
        "不是实物稳定性证明，也不是打印机支撑生成。",
    ),
    "surface-fit": _page(
        "当用户要把网格缩放到某个表面尺寸时使用。没有 CAD 曲面拟合。",
        "尺寸贴合",
        "用单轴等比缩放近似用户要的尺寸。",
        """
1. mesh_info 读当前尺寸。
2. scale_model 的 axis 和 size_mm 用用户指定的值。
3. 说明这是等比缩放，不是曲面贴合或实体重建。
""".strip(),
        "mesh_info、scale_model。",
        "STEP 曲面拟合尚未具备。",
    ),
    "svg-edit": _page(
        "当用户要修改工作区里的 SVG 时使用。",
        "SVG",
        "把 SVG 当文本编辑，不调用外部设计软件。",
        """
1. 只打开工作区内的 .svg。
2. 按用户的要求改形状或文字，保持文件仍是 SVG。
3. 用户要把轮廓变成三维时再报价，不自动转换。
""".strip(),
        "list_workspace_files、write_workspace_note。",
        "没有矢量编辑器界面。浮雕服务尚未具备。",
    ),
    "taubin-smooth": _page(
        "当用户要光顺三角网格时使用。不补洞，也不做水密修复。",
        "Taubin 光顺",
        "使用本地 Taubin λ/μ。默认锁定开口边界。",
        """
1. 调用 taubin_smooth。iterations 为 1 到 50，lamb 在 (0, 1]，mu 在 [-1, 0)。
2. 用户没指定时用默认 8、0.5、-0.53，lock_boundary 为 true。
3. 告诉用户输出路径，并说明这不是 watertight 水密修复。
""".strip(),
        "taubin_smooth、mesh_audit。",
        "watertight 水密修复尚未具备。",
    ),
    "texture-bake": _page(
        "当用户要把高模法线烘焙到低模时使用。这是本地 Cycles，不是远程贴图。",
        "法线烘焙",
        "BLENDER_BIN 已设置时才烘焙。彩色贴图仍走 Triverse 报价。",
        """
1. 确认高模和低模都在工作区。调用 texture_bake。
2. Blender 未安装时说明未运行，不要编造 PNG。
3. 用户要彩色贴图时改报价 texture_model 或 text_to_texture，不要把法线当成彩色结果。
""".strip(),
        "texture_bake、texture_model、text_to_texture。",
        "本地烘焙不是远程贴图，也不是 multicolor。",
    ),
    "video-sequence": _page(
        "当用户要把一组图片收成视频，或裁一段已有视频时使用。",
        "视频序列",
        "用 ffmpeg 的图片序列或裁切。",
        """
1. 有序图片用 media_convert kind=images_to_mp4。
2. 已有视频要截取时用 trim，秒数来自用户。
3. 先 media_probe。不要使用 Remotion。
""".strip(),
        "media_probe、media_convert。",
        "remotion 尚未具备。",
    ),
}

_ROUTING = _page(
    "当请求还没对应到具体工具时先使用。它说明 30862 上哪些事能做、哪些尚未具备。",
    "Triverse Canvas",
    "30862 的工具来自 Pod 内的 triverse MCP。新对话才会载入技能和 MCP。已打开的旧对话看不到这次新增的能力。",
    """
1. image_to_model、text_to_model、贴图、model_remesh、convert_model_format、model_preview_render、image_generation 和 prompt_optimize 都先报价。confirm 默认 false。
2. 网格统计、诊断、STL、3MF、Taubin、缩放、灰度高度场、支撑估计、ffmpeg 和字幕不扣三维积分。
3. Blender 布尔、四视图和法线烘焙依赖 BLENDER_BIN。未设置就说明 Blender 未安装。
4. 灰度高度场不是 relief 浮雕服务。支撑估计不是实物证明。3MF 不发送到打印机。
5. 游戏、原型和演示只在工作区写代码并运行。不要假装引擎或 Electron 已经存在。
6. 多视图、浮雕服务、拆件、多色、自动绑骨、水密修复、LOD、sapiens、物理打印机、Electron、账号权益、MDF、STEP、remotion、MetaHuman 和真实游戏引擎都回答尚未具备。
""".strip(),
    "MCP 服务器 triverse 里的工具。workspace 是 /projects 下的目录名。",
    "表里标成尚未具备的项目不要用别的工具冒充。",
)


ENTRIES = _entries()


def render(name: str, description: str, title: str, body: str) -> str:
    """Return one agentskills document. The directory name is the skill name."""

    if not description or len(description) > 1024:
        raise ValueError(name)
    escaped = description.replace("\\", "\\\\").replace('"', '\\"')
    return f'---\nname: {name}\ndescription: "{escaped}"\n---\n\n# {title}\n\n{body}'


def write_all(root: Path) -> None:
    """Write agent/canvas_skills/<name>/SKILL.md from ENTRIES."""

    root.mkdir(parents=True, exist_ok=True)
    for name, (description, title, body) in ENTRIES.items():
        folder = root / name
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "SKILL.md").write_text(render(name, description, title, body), encoding="utf-8")


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "canvas_skills"
    write_all(destination)
    print(f"wrote {len(ENTRIES)} skills to {destination}")


if __name__ == "__main__":
    main()
