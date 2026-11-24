"""Create a small wire-format fixture with the actual Lua observer, without PBZ."""
from pathlib import Path
import ast
import json
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'lib'))
from lupa.lua54 import LuaRuntime

# Reuse the thread-checking engine facade without executing its test suite.
tree = ast.parse((HERE / 'test_observation.py').read_text(encoding='utf-8'))
base = next(ast.literal_eval(node.value) for node in tree.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == 'BASE' for target in node.targets))
lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute(base)
module = lua.execute((HERE.parent / 'observation-hooks.lua').read_text(encoding='utf-8'))
lua.globals().M = module
lua.execute("""
game()
a,task,actor,tl=ability('FeiZei_SpecialAttack_07')
invoke(BYNAME,'pre',a,param('Main'),param(1.2),param(0),param(2.883))
task.CurrentTime=2.9
invoke(BYNAME,'post',a,param('Main'),param(1.2),param(0),param(2.883))
maintenance()
publish()
""")
writes = lua.globals().T.writes
value = json.loads(writes[len(writes)]['body'])
assert value['schemaVersion'] == 2
assert isinstance(value['events'][0]['callId'], str)
assert value['events'][0]['context']['activation'] == {'status': 'read', 'value': 3}
assert len(value['events']) == 2 and len(value['focusSummaries']) == 1
target = HERE / 'observer-schema2-wire-fixture.json'
target.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'fixture': str(target), 'bytes': target.stat().st_size,
                  'events': len(value['events']), 'focusSummaries': len(value['focusSummaries'])}))
