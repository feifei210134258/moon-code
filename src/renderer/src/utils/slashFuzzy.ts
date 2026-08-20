/**
 * Slash 命令模糊匹配。
 *
 * 对齐 Kimi Code 上游 slash 菜单的搜索行为：按命令名、描述文本、拼音全拼、
 * 拼音首字母模糊搜索（例如输入 'qx' 或 '取消' 都能命中含义为取消的命令），
 * 并返回命中片段位置供菜单项加粗高亮。
 *
 * 拼音为轻量实现：内置常用命令汉字的 汉字→全拼 映射表，不引入第三方拼音库；
 * 未收录的汉字不参与拼音匹配，但仍可被直接的子串匹配命中。
 */

export interface SlashMatchRange {
  /** 半开区间 [start, end)，指向候选文本（name 或 description）的字符偏移。 */
  start: number
  end: number
}

export interface SlashMatch {
  /** 匹配强度，越高越贴近用户意图；用于给菜单项排序。 */
  score: number
  /** 命中片段在命令名中的区间。 */
  nameRanges: SlashMatchRange[]
  /** 命中片段在描述文本中的区间。 */
  descriptionRanges: SlashMatchRange[]
}

export interface SlashCandidate {
  name: string
  description: string
}

export interface RankedSlashCandidate<T extends SlashCandidate> {
  candidate: T
  match: SlashMatch
}

/** highlightText 的输出片段：一段文本 + 是否命中（命中段由调用方加粗高亮）。 */
export interface HighlightSegment {
  text: string
  highlighted: boolean
}

/**
 * 常用命令汉字 → 全拼（小写）。命令描述以中文出现的高频字。
 * 多音字取命令场景最常用读音（如 模 mo、校 jiao、粘 zhan、重 chong、的 de）。
 */
const HAN_PINYIN: Record<string, string> = {
  的: 'de', 地: 'di', 得: 'de', 了: 'le', 着: 'zhe', 一: 'yi', 是: 'shi', 在: 'zai',
  有: 'you', 和: 'he', 就: 'jiu', 都: 'dou', 而: 'er', 及: 'ji', 与: 'yu', 或: 'huo',
  且: 'qie', 等: 'deng', 从: 'cong', 到: 'dao', 把: 'ba', 被: 'bei', 让: 'rang', 使: 'shi',
  可: 'ke', 以: 'yi', 们: 'men', 你: 'ni', 我: 'wo', 他: 'ta', 它: 'ta', 她: 'ta',
  这: 'zhe', 那: 'na', 哪: 'na', 什: 'shen', 么: 'me', 各: 'ge', 每: 'mei', 其: 'qi',
  此: 'ci', 该: 'gai', 今: 'jin', 明: 'ming', 昨: 'zuo', 时: 'shi', 天: 'tian', 年: 'nian',
  月: 'yue', 为: 'wei', 于: 'yu', 之: 'zhi', 所: 'suo', 因: 'yin', 如: 'ru', 何: 'he',
  怎: 'zen', 还: 'huan', 才: 'cai', 再: 'zai', 又: 'you', 也: 'ye', 但: 'dan', 却: 'que',
  则: 'ze', 即: 'ji', 刚: 'gang', 已: 'yi', 未: 'wei', 将: 'jiang', 曾: 'ceng', 当: 'dang',
  最: 'zui', 非: 'fei', 没: 'mei', 别: 'bie', 想: 'xiang', 看: 'kan', 听: 'ting', 问: 'wen',
  答: 'da', 给: 'gei', 拿: 'na', 只: 'zhi', 多: 'duo', 少: 'shao', 几: 'ji', 些: 'xie',
  余: 'yu', 万: 'wan', 零: 'ling', 整: 'zheng', 齐: 'qi', 全: 'quan', 共: 'gong', 单: 'dan',
  独: 'du', 双: 'shuang', 总: 'zong', 均: 'jun', 匀: 'yun', 恒: 'heng', 趋: 'qu', 向: 'xiang',
  精: 'jing', 粗: 'cu', 繁: 'fan', 简: 'jian', 优: 'you', 劣: 'lie', 美: 'mei', 丑: 'chou',
  善: 'shan', 恶: 'e', 真: 'zhen', 假: 'jia', 好: 'hao', 坏: 'huai', 正: 'zheng', 反: 'fan',
  对: 'dui', 错: 'cuo', 无: 'wu', 存: 'cun', 活: 'huo', 死: 'si', 生: 'sheng', 长: 'chang',
  短: 'duan', 宽: 'kuan', 窄: 'zhai', 厚: 'hou', 薄: 'bo', 深: 'shen', 浅: 'qian', 高: 'gao',
  低: 'di', 大: 'da', 小: 'xiao', 轻: 'qing', 重: 'chong', 快: 'kuai', 慢: 'man', 早: 'zao',
  晚: 'wan', 先: 'xian', 后: 'hou', 新: 'xin', 旧: 'jiu', 老: 'lao', 强: 'qiang', 弱: 'ruo',
  硬: 'ying', 软: 'ruan', 干: 'gan', 湿: 'shi', 冷: 'leng', 热: 're', 暖: 'nuan', 凉: 'liang',
  温: 'wen', 冰: 'bing', 水: 'shui', 火: 'huo', 风: 'feng', 雨: 'yu', 雪: 'xue', 晴: 'qing',
  阴: 'yin', 云: 'yun', 雾: 'wu', 雷: 'lei', 闪: 'shan', 电: 'dian', 光: 'guang', 声: 'sheng',
  音: 'yin', 色: 'se', 形: 'xing', 状: 'zhuang', 态: 'tai', 姿: 'zi', 势: 'shi', 暗: 'an',
  亮: 'liang', 清: 'qing', 楚: 'chu', 含: 'han', 义: 'yi', 意: 'yi', 思: 'si', 指: 'zhi',
  标: 'biao', 记: 'ji', 取: 'qu', 消: 'xiao', 确: 'que', 认: 'ren', 提: 'ti', 交: 'jiao',
  发: 'fa', 布: 'bu', 部: 'bu', 署: 'shu', 分: 'fen', 析: 'xi', 检: 'jian', 查: 'cha',
  审: 'shen', 测: 'ce', 试: 'shi', 构: 'gou', 建: 'jian', 编: 'bian', 译: 'yi', 运: 'yun',
  行: 'xing', 执: 'zhi', 调: 'tiao', 化: 'hua', 修: 'xiu', 复: 'fu', 理: 'li', 置: 'zhi',
  恢: 'hui', 回: 'hui', 滚: 'gun', 迁: 'qian', 移: 'yi', 升: 'sheng', 级: 'ji', 降: 'jiang',
  更: 'geng', 安: 'an', 装: 'zhuang', 卸: 'xie', 注: 'zhu', 册: 'ce', 登: 'deng', 录: 'lu',
  退: 'tui', 出: 'chu', 关: 'guan', 开: 'kai', 创: 'chuang', 成: 'cheng', 写: 'xie', 撰: 'zhuan',
  改: 'gai', 辑: 'ji', 删: 'shan', 除: 'chu', 添: 'tian', 加: 'jia', 插: 'cha', 入: 'ru',
  制: 'zhi', 动: 'dong', 保: 'bao', 载: 'zai', 导: 'dao', 下: 'xia', 上: 'shang', 同: 'tong',
  步: 'bu', 合: 'he', 并: 'bing', 拆: 'chai', 搜: 'sou', 索: 'suo', 找: 'zhao', 询: 'xun',
  过: 'guo', 滤: 'lv', 排: 'pai', 序: 'xu', 组: 'zu', 统: 'tong', 计: 'ji', 算: 'suan',
  比: 'bi', 较: 'jiao', 转: 'zhuan', 换: 'huan', 格: 'ge', 式: 'shi', 压: 'ya', 缩: 'suo',
  解: 'jie', 密: 'mi', 备: 'bei', 份: 'fen', 监: 'jian', 控: 'kong', 跟: 'gen', 踪: 'zong',
  日: 'ri', 志: 'zhi', 告: 'gao', 警: 'jing', 示: 'shi', 通: 'tong', 知: 'zhi', 帮: 'bang',
  助: 'zhu', 文: 'wen', 档: 'dang', 说: 'shuo', 释: 'shi', 翻: 'fan', 结: 'jie', 汇: 'hui',
  报: 'bao', 评: 'ping', 批: 'pi', 准: 'zhun', 拒: 'ju', 绝: 'jue', 允: 'yun', 许: 'xu',
  禁: 'jin', 止: 'zhi', 启: 'qi', 显: 'xian', 隐: 'yin', 藏: 'cang', 展: 'zhan', 折: 'zhe',
  叠: 'die', 选: 'xuan', 择: 'ze', 应: 'ying', 用: 'yong', 设: 'she', 配: 'pei', 管: 'guan',
  掌: 'zhang', 切: 'qie', 跳: 'tiao', 航: 'hang', 位: 'wei', 预: 'yu', 览: 'lan', 打: 'da',
  印: 'yin', 渲: 'xuan', 染: 'ran', 绘: 'hui', 验: 'yan', 证: 'zheng', 核: 'he', 规: 'gui',
  校: 'jiao', 拉: 'la', 抓: 'zhua', 粘: 'zhan', 贴: 'tie', 剪: 'jian', 拼: 'pin', 接: 'jie',
  锁: 'suo', 挂: 'gua', 起: 'qi', 停: 'ting', 暂: 'zan', 断: 'duan', 继: 'ji', 续: 'xu',
  待: 'dai', 完: 'wan', 缺: 'que', 丢: 'diu', 覆: 'fu', 盖: 'gai', 掩: 'yan', 蔽: 'bi',
  阻: 'zu', 塞: 'se', 拦: 'lan', 截: 'jie', 馈: 'kui', 返: 'fan', 放: 'fang', 弃: 'qi',
  刷: 'shua', 器: 'qi', 服: 'fu', 务: 'wu', 客: 'ke', 户: 'hu', 端: 'duan', 库: 'ku',
  据: 'ju', 表: 'biao', 列: 'lie', 元: 'yuan', 素: 'su', 值: 'zhi', 内: 'nei', 容: 'rong',
  题: 'ti', 底: 'di', 背: 'bei', 景: 'jing', 前: 'qian', 体: 'ti', 颜: 'yan', 边: 'bian',
  框: 'kuang', 距: 'ju', 离: 'li', 间: 'jian', 车: 'che', 键: 'jian', 鼠: 'shu', 点: 'dian',
  击: 'ji', 按: 'an', 拖: 'tuo', 盘: 'pan', 输: 'shu', 替: 'ti', 寻: 'xun', 进: 'jin',
  左: 'zuo', 右: 'you', 心: 'xin', 顶: 'ding', 页: 'ye', 屏: 'ping', 幕: 'mu', 弹: 'tan',
  话: 'hua', 息: 'xi', 邮: 'you', 件: 'jian', 链: 'lian', 网: 'wang', 站: 'zhan', 址: 'zhi',
  误: 'wu', 失: 'shi', 败: 'bai', 功: 'gong', 束: 'shu', 终: 'zhong', 系: 'xi', 环: 'huan',
  境: 'jing', 变: 'bian', 量: 'liang', 参: 'can', 属: 'shu', 性: 'xing', 方: 'fang', 法: 'fa',
  函: 'han', 象: 'xiang', 类: 'lei', 口: 'kou', 模: 'mo', 学: 'xue', 习: 'xi', 架: 'jia',
  引: 'yin', 擎: 'qing', 依: 'yi', 赖: 'lai', 缓: 'huan', 冲: 'chong', 区: 'qu', 队: 'dui',
  栈: 'zhan', 堆: 'dui', 集: 'ji', 典: 'dian', 映: 'ying', 射: 'she', 哈: 'ha', 钥: 'yao',
  令: 'ling', 牌: 'pai', 会: 'hui', 议: 'yi', 协: 'xie', 版: 'ban', 代: 'dai', 码: 'ma',
  源: 'yuan', 二: 'er', 脚: 'jiao', 本: 'ben', 命: 'ming', 目: 'mu', 路: 'lu', 径: 'jing',
  项: 'xiang', 工: 'gong', 作: 'zuo', 程: 'cheng', 块: 'kuai', 包: 'bao', 扩: 'kuo', 技: 'ji',
  能: 'neng', 术: 'shu', 具: 'ju', 平: 'ping', 台: 'tai', 权: 'quan', 限: 'xian', 授: 'shou',
  凭: 'ping', 书: 'shu', 夹: 'jia', 空: 'kong', 默: 'mo', 初: 'chu', 始: 'shi', 常: 'chang',
  特: 'te', 定: 'ding', 个: 'ge', 人: 'ren', 杂: 'za', 详: 'xiang', 细: 'xi', 摘: 'zhai',
  要: 'yao', 纲: 'gang', 忘: 'wang', 阅: 'yue', 读: 'du', 香: 'xiang', 味: 'wei', 邪: 'xie',
  直: 'zhi', 曲: 'qu', 陡: 'dou', 斜: 'xie', 垂: 'chui', 竖: 'shu', 横: 'heng', 纵: 'zong',
  乱: 'luan', 派: 'pai', 委: 'wei', 任: 'ren', 职: 'zhi', 责: 'ze', 扮: 'ban', 演: 'yan',
  承: 'cheng', 担: 'dan', 负: 'fu', 督: 'du', 领: 'ling', 织: 'zhi', 沟: 'gou', 流: 'liu',
  讨: 'tao', 论: 'lun', 商: 'shang', 谈: 'tan', 判: 'pan', 决: 'jue', 策: 'ce', 挥: 'hui',
  遵: 'zun', 守: 'shou', 度: 'du', 针: 'zhen', 政: 'zheng', 措: 'cuo', 施: 'shi', 巧: 'qiao',
  料: 'liao', 案: 'an', 略: 'lve', 概: 'gai', 述: 'shu', 括: 'kuo', 阐: 'chan', 勘: 'kan',
  察: 'cha', 实: 'shi', 考: 'kao', 价: 'jia', 竞: 'jing', 争: 'zheng', 赛: 'sai', 游: 'you',
  戏: 'xi', 玩: 'wan', 耍: 'shua', 休: 'xiu', 教: 'jiao', 育: 'yu', 培: 'pei', 训: 'xun',
  练: 'lian', 腐: 'fu', 堕: 'duo', 落: 'luo', 费: 'fei', 投: 'tou', 资: 'zi', 融: 'rong',
  兼: 'jian', 顾: 'gu', 毕: 'bi', 顿: 'dun', 耽: 'dan', 搁: 'ge', 延: 'yan', 迟: 'chi',
  推: 'tui', 顺: 'shun', 拽: 'zhuai', 刻: 'ke', 隔: 'ge', 至: 'zhi', 然: 'ran', 剖: 'pou',
  俯: 'fu', 仰: 'yang', 轴: 'zhou', 另: 'ling', 浏: 'liu', 抄: 'chao', 原: 'yuan', 做: 'zuo',
  机: 'ji', 账: 'zhang', 号: 'hao', 员: 'yuan', 者: 'zhe', 线: 'xian', 异: 'yi', 串: 'chuan',
  乐: 'le', 观: 'guan', 悲: 'bei', 积: 'ji', 极: 'ji', 众: 'zhong', 逆: 'ni', 相: 'xiang',
  固: 'gu', 倾: 'qing', 称: 'cheng', 中: 'zhong', 轨: 'gui', 迹: 'ji', 弧: 'hu', 圆: 'yuan',
  周: 'zhou', 面: 'mian', 力: 'li', 感: 'gan', 磁: 'ci', 场: 'chang', 振: 'zhen', 幅: 'fu',
  谱: 'pu', 采: 'cai', 样: 'yang', 域: 'yu', 道: 'dao', 图: 'tu', 散: 'san', 吸: 'xi',
  收: 'shou', 金: 'jin', 木: 'mu', 皮: 'pi', 肤: 'fu', 毛: 'mao', 羽: 'yu', 鳞: 'lin',
  壳: 'ke', 骨: 'gu', 骼: 'ge', 肌: 'ji', 肉: 'rou', 血: 'xue', 液: 'ye', 胞: 'bao',
  官: 'guan', 免: 'mian', 疫: 'yi', 菌: 'jun', 治: 'zhi', 疗: 'liao', 医: 'yi', 药: 'yao',
  物: 'wu', 疾: 'ji', 症: 'zheng', 诊: 'zhen', 防: 'fang', 健: 'jian', 康: 'kang', 卫: 'wei',
  食: 'shi', 品: 'pin', 饮: 'yin', 营: 'ying', 养: 'yang', 膳: 'shan', 烹: 'peng', 饪: 'ren',
  菜: 'cai', 脂: 'zhi', 肪: 'fang', 蛋: 'dan', 白: 'bai', 维: 'wei', 矿: 'kuang', 微: 'wei',
  酸: 'suan', 碱: 'jian', 氧: 'yang', 剂: 'ji', 催: 'cui', 产: 'chan', 副: 'fu', 效: 'xiao',
  果: 'guo', 型: 'xing', 数: 'shu', 信: 'xin'
}

interface PinyinAnalysis {
  /** 所有汉字全拼拼接（不含非汉字字符）。 */
  full: string
  /** full 中每个字符对应的源文本偏移。 */
  fullOwners: number[]
  /** 每个汉字首字母拼接。 */
  initials: string
  /** initials 中每个字符对应的源文本偏移。 */
  initialsOwners: number[]
}

function analyzePinyin(text: string): PinyinAnalysis | null {
  let full = ''
  const fullOwners: number[] = []
  let initials = ''
  const initialsOwners: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const pinyin = HAN_PINYIN[text[index] ?? '']
    if (pinyin === undefined) continue
    for (const char of pinyin) {
      full += char
      fullOwners.push(index)
    }
    initials += pinyin[0]!
    initialsOwners.push(index)
  }
  return full.length === 0 ? null : { full, fullOwners, initials, initialsOwners }
}

/** 在文本中找出 query 的所有子串区间，半开区间 [start, end)。 */
function substringRanges(text: string, query: string): SlashMatchRange[] {
  const ranges: SlashMatchRange[] = []
  let offset = 0
  while (offset <= text.length - query.length) {
    const found = text.indexOf(query, offset)
    if (found < 0) break
    ranges.push({ start: found, end: found + query.length })
    offset = found + 1
  }
  return ranges
}

/** 把拼音拼接串中的命中区间映射回源文本的字符区间（覆盖命中涉及的所有汉字）。 */
function pinyinRanges(
  search: string,
  owners: number[],
  query: string
): SlashMatchRange[] {
  const ranges: SlashMatchRange[] = []
  let offset = 0
  while (offset <= search.length - query.length) {
    const found = search.indexOf(query, offset)
    if (found < 0) break
    const start = owners[found] ?? 0
    const end = (owners[found + query.length - 1] ?? start) + 1
    ranges.push({ start, end })
    offset = found + 1
  }
  return ranges
}

interface FieldMatch {
  score: number
  ranges: SlashMatchRange[]
}

const SCORES = {
  NAME_PREFIX: 100,
  NAME_PINYIN_PREFIX: 90,
  NAME_SUBSTRING: 80,
  NAME_PINYIN_SUBSTRING: 70,
  DESC_PREFIX: 65,
  DESC_PINYIN_PREFIX: 60,
  DESC_SUBSTRING: 45,
  DESC_PINYIN_SUBSTRING: 40
} as const

/**
 * 在单个字段（name 或 description）上评估 query，取命中档位中最强者。
 * 命中档位：直接子串（前缀优先）高于拼音全拼/首字母（前缀优先）。
 */
function evaluateField(field: 'name' | 'description', text: string, query: string): FieldMatch | null {
  const isName = field === 'name'
  const lower = text.toLocaleLowerCase()
  let best: FieldMatch | null = null
  const consider = (score: number, ranges: SlashMatchRange[]): void => {
    if (best === null || score > best.score) best = { score, ranges }
  }
  if (lower.includes(query)) {
    const ranges = substringRanges(lower, query)
    const isPrefix = lower.startsWith(query)
    consider(
      isPrefix
        ? isName ? SCORES.NAME_PREFIX : SCORES.DESC_PREFIX
        : isName ? SCORES.NAME_SUBSTRING : SCORES.DESC_SUBSTRING,
      ranges
    )
  }
  const pinyin = analyzePinyin(text)
  if (pinyin !== null) {
    for (const [search, owners] of [
      [pinyin.full, pinyin.fullOwners],
      [pinyin.initials, pinyin.initialsOwners]
    ] as const) {
      if (!search.includes(query)) continue
      const ranges = pinyinRanges(search, owners, query)
      const isPrefix = search.startsWith(query)
      consider(
        isPrefix
          ? isName ? SCORES.NAME_PINYIN_PREFIX : SCORES.DESC_PINYIN_PREFIX
          : isName ? SCORES.NAME_PINYIN_SUBSTRING : SCORES.DESC_PINYIN_SUBSTRING,
        ranges
      )
    }
  }
  return best
}

/**
 * 匹配单个 slash 候选。query 会先 trim 并小写化；
 * 空 query 或没有命中时返回 null。
 */
export function matchSlashCommand(
  candidate: SlashCandidate,
  query: string
): SlashMatch | null {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length === 0) return null
  const name = evaluateField('name', candidate.name, normalized)
  const description = evaluateField('description', candidate.description, normalized)
  if (name === null && description === null) return null
  const best = name === null
    ? description!
    : description === null || name.score >= description.score
      ? name
      : description
  return {
    score: best.score,
    nameRanges: best === name ? name.ranges : [],
    descriptionRanges: best === description ? description.ranges : []
  }
}

/**
 * 对候选列表做模糊匹配并按匹配强度降序排序（同分保持原顺序）。
 * 空 query 返回空数组；调用方应在 query 为空时直接展示全部候选。
 */
export function rankSlashCandidates<T extends SlashCandidate>(
  candidates: T[],
  query: string
): RankedSlashCandidate<T>[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length === 0) return []
  const ranked: RankedSlashCandidate<T>[] = []
  for (const candidate of candidates) {
    const match = matchSlashCommand(candidate, normalized)
    if (match !== null) ranked.push({ candidate, match })
  }
  return ranked.sort((a, b) => b.match.score - a.match.score)
}

/** 把文本按命中区间切分成片段，供渲染层对命中段加粗高亮。重叠区间会先合并。 */
export function highlightText(
  text: string,
  ranges: SlashMatchRange[]
): HighlightSegment[] {
  if (ranges.length === 0) return [{ text, highlighted: false }]
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: SlashMatchRange[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  const segments: HighlightSegment[] = []
  let cursor = 0
  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), highlighted: false })
    }
    segments.push({ text: text.slice(range.start, range.end), highlighted: true })
    cursor = range.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false })
  }
  return segments
}