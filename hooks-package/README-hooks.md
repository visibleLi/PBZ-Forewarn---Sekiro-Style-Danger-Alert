# PBZForewarn 0.5 的可选任务发现桥

main.lua 只加载同目录 timeline-hooks.lua。安装位置是 platform/steam/ue4ss/Mods/PBZForewarnHooks/Scripts/，附 enabled.txt；没有声音播放器启动逻辑。

桥在游戏线程观察 LegoAbility.PlayTimeline 和 PlayTimelineByName，保存对象路径线索；后台以约 50ms 周期发布 Saved/pbzforewarn_hooks.json。这里仍有任务发现文件桥，但它不传音效事件。JS 保留活动任务扫描兜底。

Hooks=0 可以停用；Lua 只在启动时读配置，所以切换需完整重启。REGISTERED 表示注册成功，HIT 表示实际命中；active 心跳本身不证明覆盖。标准 Lua 覆盖写可能短暂半写，JS 会重读。

测试：tests/test_hooks.py（桥行为）与 tests/test_entry.py（无外部进程的入口）。Python 需要 lupa==2.8。这些是模拟引擎检查。
