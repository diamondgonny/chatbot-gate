"""가짜 Docker·Caddy 세계.

배포 스크립트가 부르는 docker 명령을 파일 하나(world.json)에 대한 연산으로 흉내 낸다.
실제 Docker와 네트워크는 쓰지 않는다. 사용법:

  sim.py docker <docker 인자...>   PATH의 docker 래퍼가 부른다
  sim.py hook <op>                 mv 같은 다른 래퍼가 주입 지점을 알릴 때 부른다
  sim.py <제어 명령> ...            사례 스크립트가 세계를 꾸미고 조회할 때 부른다

모든 docker 호출은 calls.log에 남고, 컨테이너를 끝낼 수 있는 호출은 실제 upstream을
직접 조회해 서빙 중인 대상이면 violations에 기록한다(공통 불변식).
"""
import copy
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from contextlib import contextmanager

SIM = os.environ.get('SIM_DIR') or sys.exit('SIM_DIR is not set')
REPO = 'ghcr.io/diamondgonny/chatbot-gate/chatbot-gate-backend'
API_HOST = 'api.chatbotgate.click'
BACKEND = 'chatbot-gate-backend-'
PLACEHOLDER = BACKEND + '{env.ACTIVE_ENV}:4000'
MONGO = 'chatbot-gate-mongo'
MUTATING = re.compile(r'^(caddy\.admin\.patch|container\.(stop|rm|kill|restart)|'
                      r'compose\.(up|rm|stop|down|restart)|image\.(rm|prune)|mv \.deployment-state$)')


def hx(label, salt):
    return hashlib.sha256(f'{salt}:{label}'.encode()).hexdigest()


def path(name):
    return os.path.join(SIM, name)


@contextmanager
def world():
    with open(path('lock'), 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with open(path('world.json')) as f:
            w = json.load(f)
        yield w
        tmp = path(f'world.json.{os.getpid()}')
        with open(tmp, 'w') as f:
            json.dump(w, f, indent=1)
        os.replace(tmp, path('world.json'))


def append(name, line):
    with open(path(name), 'a') as f:
        f.write(line + '\n')


# ---------------------------------------------------------------- 세계 초기화

def site(host, dial, extra=None):
    proxy = {'handler': 'reverse_proxy', 'upstreams': [{'dial': dial}]}
    proxy.update(extra or {})
    return {'match': [{'host': [host]}], 'terminal': True,
            'handle': [{'handler': 'subroute', 'routes': [{'handle': [proxy]}]}]}


def new_world():
    images = {}
    for label in 'ABCN':
        images[label] = {'id': 'sha256:' + hx(label, 'id'),
                         'digest': 'sha256:' + hx(label, 'digest'),
                         # N은 식별자를 넣기 전의 이미지
                         'build': None if label == 'N' else hx(label, 'build')[:40]}
    health = {'health_checks': {'active': {'uri': '/health', 'interval': 10000000000}}}
    servers = {'srv0': {'listen': [':80'], 'routes': [
        site('other.example.com', 'other-app:3000'),
        site(API_HOST, PLACEHOLDER, health),
    ]}}
    w = {
        'seq': 0, 'ops': [], 'faults': [], 'next_id': 1,
        'registry': {'images': images,
                     'tags': {'main': 'A', 'latest': 'A', 'main-A': 'A', 'main-B': 'B',
                              'main-C': 'C', 'main-N': 'N'}},
        'local': {}, 'containers': {},
        'caddy': {'admin': True, 'servers': servers, 'boot': copy.deepcopy(servers)},
        'new_container': {'health': 'healthy', 'app': True,
                          'networks': ['backend_internal', 'caddy_upstream']},
    }
    add_container(w, 'caddy', kind='caddy', env={'ACTIVE_ENV': 'blue'}, networks=['caddy_upstream'])
    add_container(w, MONGO, kind='mongo', networks=['backend_internal'])
    add_backend(w, 'blue', 'A')
    return w


def add_container(w, name, **fields):
    c = {'id': hx(w['next_id'], 'container'), 'kind': 'backend', 'running': True,
         'health': 'healthy', 'app': True, 'env': {}, 'networks': [], 'image_id': None, 'ref': None}
    w['next_id'] += 1
    c.update(fields)
    w['containers'][name] = c
    return c


def add_backend(w, env, label, ref=None):
    image = w['registry']['images'][label]
    ref = ref or f'{REPO}@{image["digest"]}'
    add_local(w, label, ref)
    fields = copy.deepcopy(w['new_container'])
    return add_container(w, BACKEND + env, env={'DEPLOYMENT_ENV': env}, image_id=image['id'],
                         ref=ref, **fields)


def add_local(w, label, ref):
    image = w['registry']['images'][label]
    entry = w['local'].setdefault(image['id'], {'label': label, 'repo_digests': [], 'repo_tags': []})
    digest_ref = f'{REPO}@{image["digest"]}'
    if digest_ref not in entry['repo_digests']:
        entry['repo_digests'].append(digest_ref)
    if '@' not in ref:
        for other in w['local'].values():
            if ref in other['repo_tags']:
                other['repo_tags'].remove(ref)
        entry['repo_tags'].append(ref)
    return image['id']


# ---------------------------------------------------------------- 조회 도우미

def find_container(w, key):
    if key in w['containers']:
        return key
    for name, c in w['containers'].items():
        if len(key) >= 12 and c['id'].startswith(key):
            return name
    return None


def find_local(w, ref):
    for image_id, entry in w['local'].items():
        short = image_id.split(':', 1)[1]
        if ref in (image_id, short) or (len(ref) >= 12 and short.startswith(ref)):
            return image_id
        if ref in entry['repo_digests'] or ref in entry['repo_tags']:
            return image_id
    return None


def resolve_registry(w, ref):
    """레지스트리에서 참조가 가리키는 이미지 라벨. 없으면 None."""
    reg = w['registry']
    if ref.startswith(REPO + '@'):
        digest = ref.split('@', 1)[1]
        return next((l for l, i in reg['images'].items() if i['digest'] == digest), None)
    if ref.startswith(REPO + ':'):
        return reg['tags'].get(ref.split(':')[-1])
    return None


def resolve_dial(w, dial):
    env = w['containers'].get('caddy', {}).get('env', {})
    return re.sub(r'\{env\.(\w+)\}', lambda m: env.get(m.group(1), ''), dial)


def api_dials(w):
    dials = []
    for server in w['caddy']['servers'].values():
        for route in server.get('routes', []):
            if any(API_HOST in m.get('host', []) for m in route.get('match', [])):
                dials += collect_dials(route.get('handle', []))
    return dials


def collect_dials(handlers):
    dials = []
    for h in handlers:
        dials += [u.get('dial', '') for u in h.get('upstreams', [])]
        for route in h.get('routes', []):
            dials += collect_dials(route.get('handle', []))
    return dials


def upstream_name(w):
    """Caddy가 백엔드 요청을 보내는 컨테이너 이름(살아 있는지와 무관)."""
    dials = api_dials(w)
    if len(dials) != 1:
        return None
    return resolve_dial(w, dials[0]).rsplit(':', 1)[0]


def responds(w, name):
    c = w['containers'].get(name)
    return bool(c and c['running'] and c['app'])


def serving_name(w):
    name = upstream_name(w)
    if not (name and responds(w, name) and w['containers']['caddy']['running']):
        return None
    return name if 'caddy_upstream' in w['containers'][name]['networks'] else None


def health_body(w, name):
    if not responds(w, name):
        return None
    c = w['containers'][name]
    body = {'status': 'ok', 'message': 'Chatbot Gate Backend is running'}
    label = w['local'].get(c['image_id'], {}).get('label')
    build = w['registry']['images'].get(label, {}).get('build')
    if build:
        body['env'] = c['env'].get('DEPLOYMENT_ENV', 'unknown')
        body['build'] = build
    return body


def route(w, host, port):
    """Caddy 경유 요청의 (상태, 본문)."""
    for server in w['caddy']['servers'].values():
        if f':{port}' not in server.get('listen', []):
            continue
        for r in server.get('routes', []):
            if not any(host in m.get('host', []) for m in r.get('match', [])):
                continue
            dials = collect_dials(r.get('handle', []))
            name = resolve_dial(w, dials[0]).rsplit(':', 1)[0] if dials else ''
            c = w['containers'].get(name)
            body = health_body(w, name) if c and 'caddy_upstream' in c['networks'] else None
            return (200, json.dumps(body)) if body else (502, '')
        return 200, ''   # 일치하는 사이트가 없으면 Caddy가 빈 200을 돌려준다
    return None, ''


# ---------------------------------------------------------------- 주입과 기록

def hook(op, argv=None):
    """호출을 기록하고 걸린 주입의 토큰을 돌려준다. pause·reload는 여기서 처리한다."""
    with world() as w:
        w['seq'] += 1
        action = ''
        for f in w['faults']:
            if f['times'] == 0 or not re.search(f['match'], op):
                continue
            if f.get('after') and sum(1 for o in w['ops'] if re.search(f['after'], o)) < f['after_n']:
                continue
            if f['skip'] > 0:   # 앞의 몇 번은 그냥 지나간다
                f['skip'] -= 1
                continue
            if f['times'] > 0:
                f['times'] -= 1
            f['hits'] += 1
            action = f['action']
            break
        w['ops'].append(op)
        append('calls.log', f'{w["seq"]}\t{op}\t{json.dumps(argv or [])}')
    tokens = []
    for t in filter(None, action.split(',')):
        if t.startswith('pause:'):
            pause(t[6:])
        elif t == 'reload':
            with world() as w:
                w['caddy']['servers'] = copy.deepcopy(w['caddy']['boot'])
        elif t == 'datefail':   # 이후의 date 호출이 실패한다(미분류 실패)
            open(path('date-fail'), 'w').close()
            with world() as w:
                w['seq'] += 1
                append('calls.log', f'{w["seq"]}\tMARK injected\t[]')
        elif t.startswith('appdown:'):   # 그 환경의 앱이 응답을 멈춘다
            with world() as w:
                w['containers'][BACKEND + t[8:]]['app'] = False
        else:
            tokens.append(t)
    return tokens


def pause(name):
    os.makedirs(path('reached'), exist_ok=True)
    open(path(f'reached/{name}'), 'w').close()
    deadline = time.time() + 60
    while not os.path.exists(path(f'resume/{name}')):
        if time.time() > deadline:
            sys.exit(f'sim: pause {name} was never resumed')
        time.sleep(0.02)


def token(tokens, prefix, default=None):
    for t in tokens:
        if t.startswith(prefix + ':'):
            return t.split(':', 1)[1]
    return default


def maybe_fail(tokens, what):
    code = token(tokens, 'fail')
    if code is not None or 'fail' in tokens:
        sys.stderr.write(f'{what}: injected failure\n')
        sys.exit(int(code or 1))


def guard(w, name, how):
    """공통 불변식: 서빙 중인 컨테이너를 끝내는 호출이면 기록한다."""
    if serving_name(w) == name:
        append('violations', f'{how} hit the serving container {name}')
    if name in (MONGO, 'caddy'):
        append('violations', f'{how} hit {name}')


def advance_clock(seconds):
    with open(path('clock'), 'r+') as f:
        now = int(f.read().strip() or 0)
        f.seek(0)
        f.write(str(now + int(seconds)))
        f.truncate()


# ---------------------------------------------------------------- HTTP (nc, wget)

def http_reply(status, body):
    reason = {200: 'OK', 400: 'Bad Request', 404: 'Not Found', 500: 'Internal Server Error',
              502: 'Bad Gateway', 503: 'Service Unavailable'}.get(status, 'Status')
    sys.stdout.write(f'HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\n'
                     f'Content-Length: {len(body)}\r\nConnection: close\r\n\r\n{body}')


def net_faults(tokens, wait):
    if 'refuse' in tokens:
        sys.exit(1)
    if 'hang' in tokens:
        advance_clock(wait)
        sys.exit(124)


def admin_request(method, url_path, body, tokens, wait):
    """(상태, 본문). PATCH의 적용 여부는 응답과 따로 논다."""
    with world() as w:
        if not (w['containers']['caddy']['running'] and w['caddy']['admin']):
            sys.exit(1)
    net_faults(tokens, wait)
    status = int(token(tokens, 'status', 200))
    reply = ''
    with world() as w:
        root = {'config': {'apps': {'http': {'servers': w['caddy']['servers']}}}}
        parts = [p for p in url_path.split('/') if p]
        node = root
        try:
            for p in parts[:-1]:
                node = node[int(p)] if isinstance(node, list) else node[p]
            last = parts[-1]
            key = int(last) if isinstance(node, list) else last
            if method == 'GET':
                reply = json.dumps(node[key])
            elif method == 'PATCH':
                node[key]   # 없는 경로면 실패
                if 'noapply' not in tokens:
                    node[key] = json.loads(body)
            else:
                status = 400
        except (KeyError, IndexError, ValueError):
            status, reply = 400, '{"error":"invalid traversal path"}'
    if 'drop' in tokens:   # 적용됐지만 응답이 오지 않음
        advance_clock(wait)
        sys.exit(124)
    return status, reply


def health_request(op, tokens, wait, truth):
    """Caddy 경유·직접 조회의 응답을 토큰으로 바꾼다."""
    net_faults(tokens, wait)
    status, body = truth
    if status is None:
        sys.exit(1)
    if token(tokens, 'status'):
        return int(token(tokens, 'status')), ''
    if 'nonjson' in tokens:
        return 200, 'ok'
    if body and (token(tokens, 'build') or token(tokens, 'env')):
        data = json.loads(body)
        if token(tokens, 'build'):
            data['build'] = hx(token(tokens, 'build'), 'build')[:40]
        if token(tokens, 'env'):
            data['env'] = token(tokens, 'env')
        body = json.dumps(data)
    return status, body


def http_dispatch(method, host, port, url_path, host_header, body, wait, args):
    """Caddy 컨테이너에서 보낸 요청 하나. (op, 상태, 본문)을 돌려주거나 연결 실패로 끝낸다."""
    if host in ('127.0.0.1', 'localhost') and port == '2019':
        op = f'caddy.admin.{method.lower()} {url_path}'
        status, reply = admin_request(method, url_path, body, hook(op, args), wait)
    elif host in ('127.0.0.1', 'localhost'):
        op = f'caddy.http {host_header}:{port} {url_path}'
        tokens = hook(op, args)
        with world() as w:
            truth = route(w, host_header, port) if w['containers']['caddy']['running'] else (None, '')
        status, reply = health_request(op, tokens, wait, truth)
    else:
        op = f'caddy.direct {host}:{port} {url_path}'
        tokens = hook(op, args)
        with world() as w:
            c = w['containers'].get(host)
            found = health_body(w, host) if c and 'caddy_upstream' in c['networks'] and port == '4000' else None
        status, reply = health_request(op, tokens, wait, (200, json.dumps(found)) if found else (None, ''))
    return op, status, reply


def do_nc(args):
    wait, rest = 3, []
    it = iter(args)
    for a in it:
        if a == '-w':
            wait = int(next(it))
        else:
            rest.append(a)
    raw = sys.stdin.read()
    head, _, body = raw.partition('\r\n\r\n')
    lines = head.split('\r\n')
    method, url_path = lines[0].split(' ')[:2]
    headers = {k.strip().lower(): v.strip() for k, v in (l.split(':', 1) for l in lines[1:] if ':' in l)}
    op, status, reply = http_dispatch(method, rest[0], rest[1], url_path, headers.get('host', ''), body, wait, args)
    http_reply(status, reply)
    hook('done:' + op)


def do_caddy_wget(args):
    """busybox wget: 200이면 본문만, 아니면 stderr에 상태 줄을 남기고 1로 끝난다."""
    wait, header, url = 3, '', args[-1]
    it = iter(args[:-1])
    for a in it:
        if a == '-T':
            wait = int(next(it))
        elif a == '--header':
            header = next(it).split(':', 1)[1].strip()
    hostport, _, rest = url.split('//', 1)[1].partition('/')
    host, _, port = hostport.partition(':')
    op, status, reply = http_dispatch('GET', host, port or '80', '/' + rest, header or hostport, '', wait, args)
    hook('done:' + op)
    if status != 200:
        sys.stderr.write(f'wget: server returned error: HTTP/1.1 {status} Error\n')
        sys.exit(1)
    sys.stdout.write(reply)


def do_exec(args):
    args = [a for a in args if a not in ('-i', '-t', '-it')]
    target, cmd = args[0], args[1:]
    with world() as w:
        name = find_container(w, target)
        running = bool(name) and w['containers'][name]['running']
        kind = w['containers'][name]['kind'] if name else None
    if not running:
        sys.stderr.write(f'Error response from daemon: container {target} is not running\n')
        sys.exit(1)
    if kind == 'caddy' and cmd[0] == 'nc':
        return do_nc(cmd[1:])
    if kind == 'caddy' and cmd[0] == 'sh':
        # 기준 스크립트는 요청 본문을 Caddy 컨테이너의 printf로 만든다
        sys.exit(subprocess.call(['/bin/sh'] + cmd[1:]))
    if kind == 'caddy' and cmd[0] == 'getent':
        with world() as w:
            c = w['containers'].get(cmd[-1])
            sys.exit(0 if c and 'caddy_upstream' in c['networks'] else 2)
    if cmd[0] == 'wget' and kind == 'caddy':
        return do_caddy_wget(cmd[1:])
    if cmd[0] == 'wget':
        tokens = hook(f'backend.health {name}', args)
        maybe_fail(tokens, 'wget')
        with world() as w:
            body = health_body(w, name)
        if not body:
            sys.exit(1)
        sys.stdout.write(json.dumps(body))
        return
    unsupported(['exec'] + args)


# ---------------------------------------------------------------- 컨테이너

def inspect_json(w, name):
    c = w['containers'][name]
    return {'Id': c['id'], 'Name': '/' + name, 'Image': c['image_id'],
            'Config': {'Image': c['ref'], 'Env': [f'{k}={v}' for k, v in c['env'].items()]},
            'State': {'Running': c['running'], 'Status': 'running' if c['running'] else 'exited',
                      'Health': {'Status': c['health']}},
            'NetworkSettings': {'Networks': {n: {} for n in c['networks']}}}


def do_inspect(args):
    fmt, targets = None, []
    it = iter(args)
    for a in it:
        if a in ('--format', '-f'):
            fmt = next(it)
        elif a.startswith('--format='):
            fmt = a.split('=', 1)[1]
        else:
            targets.append(a)
    maybe_fail(hook('inspect ' + ' '.join(targets), args), 'docker inspect')
    out = []
    with world() as w:
        for t in targets:
            name = find_container(w, t)
            if not name:
                sys.stderr.write(f'Error: No such object: {t}\n')
                sys.exit(1)
            out.append(inspect_json(w, name))
    if fmt is None:
        print(json.dumps(out))
    elif fmt == '{{json .NetworkSettings.Networks}}':
        print(json.dumps(out[0]['NetworkSettings']['Networks']))
    elif fmt == '{{.State.Health.Status}}':
        print(out[0]['State']['Health']['Status'])
    else:
        unsupported(['inspect'] + args)


def remove_container(w, name, how):
    guard(w, name, how)
    del w['containers'][name]


def do_stop(args, op='stop'):
    targets = [a for i, a in enumerate(args) if not a.startswith('-') and (i == 0 or args[i - 1] != '-t')]
    for t in targets:
        with world() as w:
            name = find_container(w, t)
        if not name:
            sys.stderr.write(f'Error response from daemon: No such container: {t}\n')
            sys.exit(1)
        tokens = hook(f'container.{op} {name}', args)
        maybe_fail(tokens, f'docker {op}')
        with world() as w:
            if name in w['containers']:
                guard(w, name, f'docker {op}')
                w['containers'][name]['running'] = op == 'restart'
        hook(f'done:container.{op} {name}')


def do_rm(args):
    force = any(a in ('-f', '--force') for a in args)
    for t in [a for a in args if not a.startswith('-')]:
        with world() as w:
            name = find_container(w, t)
        if not name:
            sys.stderr.write(f'Error response from daemon: No such container: {t}\n')
            sys.exit(1)
        tokens = hook(f'container.rm {name}', args)
        maybe_fail(tokens, 'docker rm')
        with world() as w:
            if name in w['containers']:
                if w['containers'][name]['running'] and not force:
                    sys.stderr.write('Error response from daemon: cannot remove a running container\n')
                    sys.exit(1)
                remove_container(w, name, 'docker rm')
        hook(f'done:container.rm {name}')


# ---------------------------------------------------------------- 이미지

def do_pull(args):
    ref = args[-1]
    tokens = hook(f'pull {ref}', args)
    maybe_fail(tokens, 'docker pull')
    with world() as w:
        label = resolve_registry(w, ref)
        if not label:
            sys.stderr.write(f'Error response from daemon: manifest for {ref} not found: manifest unknown\n')
            sys.exit(1)
        add_local(w, label, ref)
    print(f'Status: Downloaded newer image for {ref}')


def do_image(args):
    sub, rest = args[0], args[1:]
    if sub == 'inspect':
        ref = [a for a in rest if not a.startswith('-')][0]
        hook(f'image.inspect {ref}', args)
        with world() as w:
            image_id = find_local(w, ref)
            if not image_id:
                sys.stderr.write(f'Error response from daemon: No such image: {ref}\n')
                sys.exit(1)
            entry = w['local'][image_id]
            build = w['registry']['images'][entry['label']]['build']
            env = ['NODE_ENV=production'] + ([f'BUILD_SHA={build}'] if build else [])
            print(json.dumps([{'Id': image_id, 'RepoDigests': entry['repo_digests'],
                               'RepoTags': entry['repo_tags'], 'Config': {'Env': env}}]))
    elif sub == 'prune':
        maybe_fail(hook('image.prune', args), 'docker image prune')
        with world() as w:
            used = {c['image_id'] for c in w['containers'].values()}
            for image_id in [i for i, e in w['local'].items() if not e['repo_tags'] and i not in used]:
                del w['local'][image_id]
    elif sub in ('ls', 'list'):
        do_images(rest)
    elif sub in ('rm', 'remove'):
        do_rmi(rest)
    else:
        unsupported(['image'] + args)


def do_images(args):
    fmt, repo = '{{.ID}}', None
    it = iter(args)
    for a in it:
        if a == '--format':
            fmt = next(it)
        elif not a.startswith('-'):
            repo = a
    hook('image.ls', args)
    with world() as w:
        for image_id, entry in w['local'].items():
            tags = [t.rsplit(':', 1) for t in entry['repo_tags']]
            names = tags + ([[REPO, '<none>']] if entry['repo_digests'] and not any(n == REPO for n, _ in tags) else [])
            for name, tag in names:
                if repo and name != repo:
                    continue
                short = image_id if '--no-trunc' in args else image_id.split(':')[1][:12]
                print(fmt.replace('{{.ID}}', short).replace('{{.Tag}}', tag).replace('{{.Repository}}', name))


def do_rmi(args):
    for ref in [a for a in args if not a.startswith('-')]:
        tokens = hook(f'image.rm {ref}', args)
        maybe_fail(tokens, 'docker rmi')
        with world() as w:
            image_id = find_local(w, ref)
            if not image_id:
                sys.stderr.write(f'Error response from daemon: No such image: {ref}\n')
                sys.exit(1)
            if any(c['image_id'] == image_id and c['running'] for c in w['containers'].values()):
                sys.stderr.write('Error response from daemon: image is being used by running container\n')
                sys.exit(1)
            del w['local'][image_id]


def do_tag(args):
    hook('image.tag ' + ' '.join(args), args)
    with world() as w:
        image_id = find_local(w, args[0])
        if not image_id:
            sys.exit(1)
        for other in w['local'].values():
            if args[1] in other['repo_tags']:
                other['repo_tags'].remove(args[1])
        w['local'][image_id]['repo_tags'].append(args[1])


# ---------------------------------------------------------------- compose

def substitute(text, env):
    def repl(m):
        name, op, arg = m.group(1), m.group(2), m.group(3)
        value = env.get(name, '')
        if value:
            return value
        if op == '?':
            sys.stderr.write(f'error while interpolating: required variable {name} is missing a value\n')
            sys.exit(1)
        return arg or ''
    return re.sub(r'\$\{(\w+)(?::?([-?])([^}]*))?\}', repl, text)


def compose_service(compose_file, service):
    with open(compose_file) as f:
        lines = f.read().split('\n')
    start = lines.index(f'  {service}:')
    block = []
    for line in lines[start + 1:]:
        if line.strip() and not line.startswith('    '):
            break
        block.append(line)
    env = {}
    dotenv = os.path.join(os.path.dirname(os.path.abspath(compose_file)), '.env')
    if os.path.exists(dotenv):
        with open(dotenv) as f:
            env.update(l.strip().split('=', 1) for l in f if '=' in l and not l.startswith('#'))
    env.update(os.environ)   # 셸 환경이 .env보다 우선한다

    def field(key, default=None):
        for line in block:
            m = re.match(rf'\s+{key}:\s*(\S+)', line)
            if m:
                return substitute(m.group(1).strip('"\''), env)
        return default
    return field('image'), field('pull_policy', 'missing')


def do_compose(args):
    compose_file, rest = 'docker-compose.yml', []
    i = 0
    while i < len(args):   # 하위 명령 앞의 전역 옵션만 읽는다
        if args[i] == '-f':
            compose_file = args[i + 1]
        elif args[i] not in ('--profile', '--env-file', '-p'):
            rest = args[i:]
            break
        i += 2
    sub, opts = rest[0], rest[1:]
    services = [a for i, a in enumerate(opts) if not a.startswith('-') and (i == 0 or opts[i - 1] not in ('-t', '--tail'))]
    if sub in ('ps', 'logs'):
        hook(f'compose.{sub}', args)
        return
    if sub not in ('up', 'rm', 'stop', 'down', 'restart'):
        unsupported(['compose'] + args)
    if not services:   # 서비스 없는 down·restart는 전부를 건드린다
        with world() as w:
            services = [n.replace('chatbot-gate-', '') for n in w['containers'] if n != 'caddy']
    for service in services:
        name = 'chatbot-gate-' + service
        tokens = hook(f'compose.{sub} {service}', args)
        maybe_fail(tokens, f'docker compose {sub}')
        if sub == 'up':
            ref, policy = compose_service(compose_file, service)
            with world() as w:
                image_id = find_local(w, ref)
                if policy == 'always' or not image_id:
                    label = resolve_registry(w, ref)
                    if not label:
                        sys.stderr.write(f'Error response from daemon: manifest for {ref} not found\n')
                        sys.exit(1)
                    add_local(w, label, ref)
                else:
                    label = w['local'][image_id]['label']
                if name in w['containers']:
                    remove_container(w, name, 'docker compose up --force-recreate')
                add_backend(w, service.replace('backend-', ''), label, ref)
        else:
            with world() as w:
                if name not in w['containers']:
                    continue
                if sub in ('rm', 'down'):
                    if sub == 'rm' and w['containers'][name]['running'] and '-s' not in opts and '--stop' not in opts:
                        continue   # compose rm은 정지된 컨테이너만 지운다
                    remove_container(w, name, f'docker compose {sub}')
                else:
                    guard(w, name, f'docker compose {sub}')
                    w['containers'][name]['running'] = sub == 'restart'
        hook(f'done:compose.{sub} {service}')


def unsupported(args):
    append('violations', 'unsupported docker call: ' + ' '.join(args))
    sys.stderr.write('sim: unsupported docker call: ' + ' '.join(args) + '\n')
    sys.exit(64)


def docker(args):
    if not args:
        unsupported(args)
    cmd, rest = args[0], args[1:]
    if cmd == 'exec':
        do_exec(rest)
    elif cmd == 'inspect' or (cmd == 'container' and rest[:1] == ['inspect']):
        do_inspect(rest[1:] if cmd == 'container' else rest)
    elif cmd in ('stop', 'kill', 'restart'):
        do_stop(rest, cmd)
    elif cmd == 'rm':
        do_rm(rest)
    elif cmd == 'pull':
        do_pull(rest)
    elif cmd == 'image':
        do_image(rest)
    elif cmd == 'images':
        do_images(rest)
    elif cmd == 'rmi':
        do_rmi(rest)
    elif cmd == 'tag':
        do_tag(rest)
    elif cmd == 'compose':
        do_compose(rest)
    elif cmd == 'ps':
        hook('ps', args)
        with world() as w:
            print('\n'.join(n for n, c in w['containers'].items() if c['running']))
    elif cmd in ('logs', 'login') or (cmd == 'network' and rest[:1] == ['inspect']):
        hook(cmd, args)
    else:
        unsupported(args)


# ---------------------------------------------------------------- 제어 명령

def set_path(w, dotted, value):
    parts = dotted.split('.')
    if parts[0] == 'c':   # c.blue.app → containers.chatbot-gate-backend-blue.app
        parts = ['containers', BACKEND + parts[1] if parts[1] in ('blue', 'green') else parts[1]] + parts[2:]
    node = w
    for p in parts[:-1]:
        node = node[int(p)] if isinstance(node, list) else node[p]
    last = int(parts[-1]) if isinstance(node, list) else parts[-1]
    node[last] = value


def api_upstreams(w):
    return w['caddy']['servers']['srv0']['routes'][1]['handle'][0]['routes'][0]['handle'][0]['upstreams']


def control(cmd, args):
    if cmd == 'init':
        os.makedirs(SIM, exist_ok=True)
        for name, content in (('world.json', json.dumps(new_world())), ('clock', '0'),
                              ('calls.log', ''), ('violations', '')):
            with open(path(name), 'w') as f:
                f.write(content)
        return
    if cmd == 'wait-reached':
        deadline = time.time() + float(args[1] if len(args) > 1 else 20)
        while not os.path.exists(path(f'reached/{args[0]}')):
            if time.time() > deadline:
                sys.exit(f'sim: pause point {args[0]} was not reached')
            time.sleep(0.02)
        return
    if cmd == 'resume':
        os.makedirs(path('resume'), exist_ok=True)
        open(path(f'resume/{args[0]}'), 'w').close()
        return
    with world() as w:
        images = w['registry']['images']
        if cmd == 'set':
            set_path(w, args[0], json.loads(args[1]))
        elif cmd == 'fault':
            opts = dict(a.split('=', 1) for a in args[2:])
            w['faults'].append({'match': args[0], 'action': args[1], 'hits': 0,
                                'times': int(opts.get('times', -1)), 'after': opts.get('after'),
                                'after_n': int(opts.get('after_n', 1)),
                                'optional': 'optional' in opts, 'skip': int(opts.get('skip', 0))})
        elif cmd == 'unfired':
            for f in w['faults']:
                if not f['hits'] and not f['optional']:
                    print(f'{f["match"]} -> {f["action"]}')
        elif cmd == 'backend':      # backend <env> <label> [tag]: 컨테이너를 세계에 직접 둔다
            ref = f'{REPO}:{args[2]}' if len(args) > 2 else None
            add_backend(w, args[0], args[1], ref)
        elif cmd == 'image':        # image <라벨>: 컨테이너 없이 로컬에만 둔다
            add_local(w, args[0], f'{REPO}@{images[args[0]]["digest"]}')
        elif cmd == 'drop':         # drop <컨테이너>: 기록 없이 세계에서 뺀다
            w['containers'].pop(find_container(w, args[0]) or BACKEND + args[0], None)
        elif cmd == 'dial':         # dial <env|placeholder|임의 문자열>
            value = {'blue': BACKEND + 'blue:4000', 'green': BACKEND + 'green:4000',
                     'placeholder': PLACEHOLDER}.get(args[0], args[0])
            api_upstreams(w)[0]['dial'] = value
        elif cmd == 'reload':
            w['caddy']['servers'] = copy.deepcopy(w['caddy']['boot'])
        elif cmd == 'recreate-caddy':   # 상태 파일을 env_file로 다시 읽는다
            with open(args[0]) as f:
                env = dict(l.strip().split('=', 1) for l in f if '=' in l)
            w['containers']['caddy']['env'] = env
            w['caddy']['servers'] = copy.deepcopy(w['caddy']['boot'])
        elif cmd == 'ref':
            print(f'{REPO}@{images[args[0]]["digest"]}')
        elif cmd == 'build':
            print(images[args[0]]['build'])
        elif cmd == 'upstream':     # dial이 가리키는 환경
            name = upstream_name(w) or ''
            print(name.replace(BACKEND, '') if name.startswith(BACKEND) else f'unknown({name})')
        elif cmd == 'serving':      # Caddy 경유 응답: "<env> <라벨>" 또는 none
            status, body = route(w, API_HOST, '80')
            data = json.loads(body) if status == 200 and body else {}
            label = next((l for l, i in images.items() if i['build'] and i['build'] == data.get('build')), '?')
            print(f'{data["env"]} {label}' if 'env' in data else 'none')
        elif cmd == 'cid':
            c = w['containers'].get(BACKEND + args[0])
            print(c['id'] if c else 'absent')
        elif cmd == 'label':        # 컨테이너가 실행하는 이미지 라벨
            c = w['containers'].get(BACKEND + args[0])
            print(w['local'].get(c['image_id'], {}).get('label', '?') if c else 'absent')
        elif cmd == 'running':
            c = w['containers'].get(BACKEND + args[0])
            print('yes' if c and c['running'] else 'no')
        elif cmd == 'local':        # 로컬에 있는 이미지 라벨
            print(' '.join(sorted(e['label'] for e in w['local'].values())))
        elif cmd == 'collateral':   # 배포가 건드리면 안 되는 것
            servers = copy.deepcopy(w['caddy']['servers'])
            servers['srv0']['routes'][1]['handle'][0]['routes'][0]['handle'][0]['upstreams'] = 'masked'
            caddy = w['containers']['caddy']
            print(json.dumps([servers, w['containers'].get(MONGO), caddy['id'], caddy['running']], sort_keys=True))
        elif cmd == 'mark':
            w['seq'] += 1
            append('calls.log', f'{w["seq"]}\tMARK {args[0]}\t[]')
        elif cmd == 'mutations-after':   # 표시 뒤에 시도된 변경 호출
            seen = False
            with open(path('calls.log')) as f:
                for line in f:
                    _, op, _ = line.rstrip('\n').split('\t', 2)
                    if op == f'MARK {args[0]}':
                        seen = True
                    elif seen and MUTATING.match(op):
                        print(op)
        else:
            sys.exit(f'sim: unknown command {cmd}')


def main():
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'docker':
        docker(args)
    elif cmd == 'hook':
        print(','.join(hook(args[0], args[1:])))
    else:
        control(cmd, args)


if __name__ == '__main__':
    main()
