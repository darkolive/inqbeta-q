/*
 * How the front door SOUNDS — 简体中文 (Simplified Chinese).
 *
 * The words on screen live in lib/i18n. These are the same words as a
 * performance: what to stress, where to breathe, how each line should feel.
 * The directions in [square brackets] are ElevenLabs audio tags. They are
 * performed, never spoken, and never shown.
 *
 * THE EXPRESSION LANGUAGE — one small vocabulary, used the same way on every
 * page, so Q always sounds like the same person:
 *
 *   [calm] [confident]     statements of principle — the rhythm lines
 *   [warmly]               the line that lands; "your rules"
 *   [reassuring]           a promise about safety or privacy
 *   [matter-of-fact]       lists, facts, no selling
 *   [explaining]           how to do something; the hints
 *   [brightly] [curious]   naming a thing you can pick; labels
 *   [inviting]             a question that opens what follows
 *   [sincere] [quietly]    something that matters; said plainly
 *   [short pause] [pause]  the beat between rhythm lines
 *
 * Tags go in English in every language — they direct the voice, and the voice
 * reads them the same way whatever language the words are in.
 *
 * A key with no script here is read by the browser's own voice from the
 * on-screen words. A key with a script is recorded by `npm run voice`.
 */
import type { Key } from '../../i18n/en';

export default {
	'signin.title': '[calm] [confident] 你的数据。[short pause] 你的设备。[short pause] [warmly] 你的规则。',
	'signin.line': '[reassuring] 一切都保存在你自己的文件夹里。[matter-of-fact] 没有账户。没有云端。没有追踪。',
	'signin.where': '[inviting] 那么——你的通行密钥在哪里？',
	'place.device': '[brightly] 这台设备。',
	'place.key': '[curious] 一把安全密钥。',
	'place.phone': '[brightly] 或者你的手机。',
	'place.thisPhone': '[brightly] 这部手机。',
	'place.device.hint': '[explaining] 也就是触控 ID、面容 ID，或者 Windows Hello。',
	'place.key.hint': '[explaining] 一把 YubiKey——插上它，或者轻触它。',
	'place.phone.hint': '[explaining] 用手机扫描二维码',
	'place.thisPhone.hint': '[explaining] 面容 ID，或者触控 ID。',
	'home.nothingStored': '[sincere] [quietly] 我们什么都不保存。[pause] 不保存你的密钥，也不保存你的 D I D。[explaining] 它们每次都从你的通行密钥重新生成。[matter-of-fact] 联系你的方式，稍后在“设置”中添加。',
	'home.whatQIs': '[curious] [inviting] 那么……Q 是什么？',
	'home.intro.lead': '[confident] [warmly] Q 保存所发生之事的证明。',
	'home.intro.body': '[explaining] 每当人与人之间发生一件事——一堂课、一份工作、一笔付款、加入一个俱乐部——Q 都会写下一份凭证。双方都签名，双方都保存。中间没有任何人持有你的数据，也没有人能悄悄改动记录。',
	'story.1.t': '[inviting] 两个人，两台电脑。',
	'story.1.d': '[explaining] 安娜和本各自都有 Q，也都有自己的文件夹。中间什么也没有。',
	'story.2.t': '[brightly] 发生了一件事。',
	'story.2.d': '[explaining] 安娜给本上了一堂课——或者做了一份工作，或者还了他钱。',
	'story.3.t': '[confident] Q 写下一份凭证。',
	'story.3.d': '[explaining] 发生了什么、在什么时候——用安娜的通行密钥签名。',
	'story.4.t': '[warmly] 本同意了。',
	'story.4.d': '[explaining] 他核对后也签了名。现在它属于他们两个人。',
	'story.5.t': '[reassuring] 各自保存一份。',
	'story.5.d': '[reassuring] 同一份凭证，在安娜的文件夹里，也在本的文件夹里。没有服务器保存它。',
	'story.6.t': '[confident] 经得起检验的证明。',
	'story.6.d': '[sincere] 多年以后，任何一方都能拿出来。改动一个字，签名就不再匹配。',
	'uses.title': '[inviting] 人们用它来做什么',
	'uses.learning.t': '[brightly] 学习证明',
	'uses.learning.d': '[matter-of-fact] 课程和学习随时记录——由你展示，而不是锁在别人的系统里。',
	'uses.clubs.t': '[brightly] 俱乐部与联盟',
	'uses.clubs.d': '[matter-of-fact] 入会、同意与会员资格，公平运作——从露营俱乐部到合作社。',
	'uses.site.t': '[brightly] 你自己的网站',
	'uses.site.d': '[matter-of-fact] 在 Q 中撰写并发布网页。每一次发布都是一份签名凭证。',
	'uses.work.t': '[brightly] 工作与付款',
	'uses.work.d': '[matter-of-fact] 完成的工作、达成的约定、转出的款项——双方都持有证据。',
	'uses.festival.t': '[brightly] 社区节庆',
	'uses.festival.d': '[matter-of-fact] 志愿者、摊主和门票，每个参与者都有清楚的记录。',
	'uses.calls.t': '[brightly] 通话与消息',
	'uses.calls.d': '[matter-of-fact] 人与人直接交谈。凭证只记下事实——谁、何时、多久——从不记录说了什么。',
	'beta.touch': '[inviting] 保持联系',
	'beta.why': '[reassuring] [quietly] 只用于告诉你关于 Q 的消息。它只会发送到 Dark Olive 的管理邮箱，不会去任何其他地方。',
	'support.title': '[warmly] 让它保持免费',
	'support.body': '[sincere] [warmly] Q 是免费的，并将一直免费——没有广告，没有投资人，不出售任何关于你的信息。它由 Darren Knipe——一位仍在工作的家长——通过 Dark Olive C-I-C 这家小型社区利益公司构建。如果 Q 对你或你关心的人有用，你的一份支持会让它继续成长，并对所有人保持免费。',
	'sec.title': '[curious] [sincere] 这有多安全？',
	'sec.lead': '[confident] Q 建立在公开发布的标准之上——安全领域用来检验自身工作的那些标准。用简单的话说：',
	'sec.honest': '[sincere] [quietly] 这些是 Q 所依据的标准，而不是认证证书。Q 仍处于测试阶段，尚未经过独立的安全审计。',
	'sec.phish.t': '[confident] 没有可被盗的密码。',
	'sec.phish.d': '[explaining] 你的通行密钥从不离开你的设备，而且只在本网站有效——仿冒网站什么也得不到。',
	'sec.nothing.t': '[confident] 我们什么都不保存。',
	'sec.nothing.d': '[explaining] 你的密钥每次都在你的设备上从通行密钥重新生成。其他任何地方都没有它们的副本。',
	'sec.did.t': '[confident] 你的身份属于你。',
	'sec.did.d': '[explaining] 一个由你自己的密钥生成的去中心化标识符——而不是我们服务器上的账户。',
	'sec.lock.t': '[confident] 离开之前先上锁。',
	'sec.lock.d': '[explaining] 每个文件在同步或备份之前，都会先在你的设备上加密。',
	'sec.tamper.t': '[confident] 任何改动都会显现。',
	'sec.tamper.d': '[explaining] 每份凭证都以它自己的指纹命名。改动一个字节，名字就不再匹配。',
	'sec.ucan.t': '[confident] 人人都能核查的权限。',
	'sec.ucan.d': '[explaining] 谁可以做什么，是一个签名令牌，并按规范自带的测试向量进行核查。',
	'sec.cedar.t': '[confident] 由经过验证的引擎裁定规则。',
	'sec.cedar.d': '[explaining] Q 的规则运行在 Cedar 中——由亚马逊云科技（AWS）构建并开源的策略语言，其核心经过形式化验证。',
	'sec.leave.t': '[confident] 不留痕迹。',
	'sec.leave.d': '[explaining] 一个按钮就能清除 Q 在浏览器中保存的一切。云端副本只能触及 Q 创建的那个文件夹。',
	'love.title': '[warmly] 用爱构建',
	'love.line': '[sincere] [warmly] 可以自由给予，绝不可随意索取。',
	'love.by': '[matter-of-fact] 由 Darren Knipe 设计，Dark Olive C-I-C。',
	'thanks.title': '[warmly] 特别感谢',
	'thanks.ai': '[warmly] 也感谢以下团队背后的工程师',
	'thanks.community': '[warmly] [sincere] 以及更广泛的社区——各种编程语言、各项标准，以及所有无私分享自己成果的人。',
	'love.source': '[confident] [warmly] Q 以 GNU AGPL 许可开源。版权归 Dark Olive C-I-C 所有；你可以在这里自由查看、运行和修改它。',
	'thanks.referral': '[matter-of-fact] 其中一些是推荐链接——如果你通过它们注册，就能帮助资助 Q。'
} satisfies Partial<Record<Key, string>>;
