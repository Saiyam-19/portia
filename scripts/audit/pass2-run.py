"""Bounded foreground command; inspect, track and clean only its owned group."""
import json, os, pathlib, signal, subprocess, sys, time

root = pathlib.Path(__file__).resolve().parents[2]
out = root / 'output/pass2'
out.mkdir(parents=True, exist_ok=True)
label, *command = sys.argv[1:]
def processes():
    return subprocess.check_output(['ps', '-axo', 'pid=,ppid=,pgid=,etime=,command='], text=True)
before = processes()
(out / (label + '-processes-before.txt')).write_text(before)
listeners = subprocess.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN'], capture_output=True, text=True).stdout
(out / (label + '-listeners-before.txt')).write_text(listeners)
env = {k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG','TERM'] or k.startswith('PASS2_')}
env['PASS1_GOLDEN_LABEL'] = 'pass2-regression'
child = None
def members():
    return [line for line in processes().splitlines() if len(line.split(None, 4)) >= 5 and int(line.split(None, 4)[2]) == child.pid]
def cleanup(*_):
    if child is None: return
    owned = members()
    if owned:
        os.killpg(child.pid, signal.SIGTERM)
        end = time.monotonic() + 3
        while members() and time.monotonic() < end: time.sleep(.05)
        prior = {line.split(None,4)[0]:line.split(None,4)[4] for line in owned}
        for line in members():
            pid, ppid, pgid, age, cmd = line.split(None,4)
            if prior.get(pid) == cmd and int(pgid) == child.pid: os.kill(int(pid), signal.SIGKILL)
        child.wait(timeout=3)
    if _: sys.exit(130)
signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)
try:
    with (out / (label + '.log')).open('w') as log:
        child = subprocess.Popen(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        record = dict(pid=child.pid, pgid=child.pid, ppid=os.getpid(), command=command, cwd=str(root), ports=[], task='01a145b5-e5e1-75b3-b810-f039c5d31693', purpose=label)
        (out / (label + '-process.json')).write_text(json.dumps(record,indent=2))
        result = child.wait(timeout=min(int(os.environ.get('PASS2_TIMEOUT_SECONDS','180')),2400))
finally:
    cleanup()
    if child:
        record.update(exitCode=child.returncode, survivors=members())
        (out / (label + '-process.json')).write_text(json.dumps(record,indent=2))
        assert not record['survivors']
print((out / (label + '.log')).read_text()[-16000:])
sys.exit(result)
