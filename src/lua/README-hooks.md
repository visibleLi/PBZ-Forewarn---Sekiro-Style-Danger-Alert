# PBZForewarn 0.6 的任务发现与只读观察桥

main.lua先加载原timeline-hooks.lua，再可选加载observation-hooks.lua。观察器加载失败不停止原发现桥。安装位置是platform/steam/ue4ss/Mods/PBZForewarnHooks/Scripts/，附enabled.txt；没有声音播放器、进程启动或游戏参数修改。

桥在游戏线程观察 LegoAbility.PlayTimeline 和 PlayTimelineByName，保存对象路径线索；后台以约 50ms 周期发布 Saved/pbzforewarn_hooks.json。这里仍有任务发现文件桥，但它不传音效事件。JS 保留活动任务扫描兜底。

Hooks=0 可以停用；Lua 只在启动时读配置，所以切换需完整重启。REGISTERED 表示注册成功，HIT 表示实际命中；active 心跳本身不证明覆盖。标准 Lua 覆盖写可能短暂半写，JS 会重读。

## 新观察文件（trial.1继续使用bounded.2格式）

`Saved/pbzforewarn_observer_hooks.json`独立于原v1 hints；schemaVersion=2。

- envelope：session、seq、heartbeat（墙钟毫秒，仅新鲜度）、active。
- retention：maxEvents=512、maxBytes=393216、firstSeq、lastSeq、dropped；不是无限战斗记录。
- health：注册/捕获/写入/卸载失败、恢复、丢失pre、匹配失败、线程拒绝、未知ABI、游戏时钟不可用、动态hook上限等累计数。
- events：seq、kind（timeline-call/warning-call）、phase、callId、matching、hookPath、atWallMs、gameTime、context、params。

PlayTimeline原生pre/post在同一同步调用栈中用相同callId关联。按反射SDK的参数顺序记录Timeline/TimelineName、PlayRate、SyncPoint、StartTimeSeconds等；数量不符或值不可读就unknown，不保留RemoteUnrealParam。仅参数数量相符不等于ABI已实机认证。

动态warning函数限32个，仅StaticFindObject发现已加载的Received_ActionBegin、Spawn Particles、Play Particle，不加载资产。运行中PlayTimeline的真实时间轴中遇到已知红蓝/黑资源，会加入其动作类候选。继承的粒子函数只有当前对象确有预警资源才记录，普通特效丢弃。

UE4SS脚本UFunction常以相同pre/post ID注册，且只调用第一个回调。此时记录phase=call、matching=single-script-callback-no-post，不捏造缺失post。原生函数的两个ID不同，才做pre/post栈配对。即使观察到动作函数调用，也不等于已测到屏幕像素或真实声音输出。

context含ability/task/actor/timeline/world/captureWorld路径、activation、taskTime；warning含action/actionClass/effect。当前task仅是GetPlayTimelineTask返回候选，不能证明共享模板的确切执行身份。sourceContextSnapshot按相同action引用查时间轴节点，记录可读StartTime/duration/offset/GUID，唯一引用也标candidate而非confirmed。GetActionEvent的out struct Lua绑定未实测，明确记unknown，不冒险调用。

gameTime只取GameplayStatics.GetTimeSeconds，附source与read/unavailable状态，绝不以os.clock或墙钟冒充。与JS端时钟应按world及source校对，不能拿导入当刻的世界补成捕获当时的世界。

观察器要求IsInGameThread可用。注册、发现、卸载和对象读取均在游戏线程；后台仅发布不可变JSON及标量健康信息。约50ms游戏线程维护、100ms后台发布。ObserveAttacks=0、Diagnostics=0或Hooks=0在启动时停用观察；改Lua侧开关必须完整重启。

路径字典与重点调用摘要在schema 2中共用有限字节预算；健康计数记录丢失与恢复，不承诺无限留存。

测试：tests/test_hooks.py（原桥50项）、tests/test_entry.py（独立降级入口）、tests/test_observation.py（时钟、线程、ABI未知、配对、动态脚本回调、限量和失败恢复）。Python需要lupa==2.8。这些是模拟引擎检查，不是实机ABI或覆盖率认证。
