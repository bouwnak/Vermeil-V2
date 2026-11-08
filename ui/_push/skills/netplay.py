"""Two Vermeils talking directly, across the internet or across a room, with no server of ours and no relay.

Each person has a 6-character code, worked out from their own key. To reach a code:
  * over the internet, both PCs look each other up in the BitTorrent DHT (a public network nobody runs; it's only used to
    swap addresses, nothing of the game goes through it), then both send at once so each home router lets the other in.
  * on the same network, a broadcast finds them sooner.
Everything after that goes straight between the two PCs over one UDP socket: encrypted, and each side proves it owns its code.
A few routers (some mobile data and carrier networks) refuse this kind of direct connection. status() then says "can't reach";
a direct address (add_route: a forwarded port, or a Tailscale address) still works there.
"""
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import select
import socket
import struct
import threading
import time
import zlib

from paths import data_file

ID_FILE = data_file("net_identity.json")
BAN_FILE = data_file("net_bans.json")
PORT, BEACON_PORT = 47630, 47631
BAN_SECONDS = 24 * 3600
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"       # no I, L, O, 0 or 1: they get misread when a code is read out
MAX_GUESTS = 8
MAX_MESSAGE = 4 * 1024 * 1024
CHUNK = 1100
RETRY_SECONDS, RETRIES = 0.35, 14
QUEUE_SECONDS = 45                                 # how long a message waits for someone to be found
BOOTSTRAP = [("router.bittorrent.com", 6881), ("dht.transmissionbt.com", 6881), ("router.utorrent.com", 6881)]
KINDS = {"friend_req", "friend_ok", "friend_no", "dm", "invite", "invite_no", "join", "join_no", "leave", "kick", "welcome",
         "pos", "people", "layout", "farm.welcome", "farm.sync", "farm.pos", "farm.act", "farm.perm", "farm.no"}
GUEST_ONLY = {"pos", "leave", "farm.pos", "farm.act"}       # from someone visiting me
HOST_ONLY = {"welcome", "kick", "pos", "people", "layout", "farm.welcome", "farm.sync", "farm.pos", "farm.perm", "farm.no", "join_no"}  # from who I'm visiting
BLOCKED_BY_BAN = {"join", "invite", "dm", "friend_req"}

# the standard 2048-bit Diffie-Hellman group (RFC 3526, group 14)
P = int("FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD"
        "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
        "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F"
        "83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
        "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510"
        "15728E5A8AACAA68FFFFFFFFFFFFFFFF", 16)


def code_of(pub):
    n = int.from_bytes(hashlib.sha256(b"vermeil-code:" + pub.to_bytes(256, "big")).digest(), "big")
    out = ""
    for _ in range(6):
        n, d = divmod(n, len(ALPHABET))
        out += ALPHABET[d]
    return out


def clean_code(text):
    code = "".join(c for c in str(text or "").upper() if c in ALPHABET)
    return code if len(code) == 6 else ""


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path, d):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=1)
    os.replace(tmp, path)


def _private(ip):
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


# ---------- locking the messages: encrypt-then-sign, with keys only the two PCs can work out ----------
def _keystream(key, nonce, size):
    out, n = bytearray(), 0
    while len(out) < size:
        out += hashlib.sha256(key + nonce + struct.pack(">I", n)).digest()
        n += 1
    return bytes(out[:size])


def seal(key, plain):
    enc, mac = hmac.new(key, b"enc", "sha256").digest(), hmac.new(key, b"mac", "sha256").digest()
    nonce = secrets.token_bytes(12)
    body = bytes(a ^ b for a, b in zip(plain, _keystream(enc, nonce, len(plain))))
    return nonce + body + hmac.new(mac, nonce + body, "sha256").digest()[:16]


def unseal(key, box):
    if len(box) < 28:
        return None
    enc, mac = hmac.new(key, b"enc", "sha256").digest(), hmac.new(key, b"mac", "sha256").digest()
    nonce, body, tag = box[:12], box[12:-16], box[-16:]
    if not hmac.compare_digest(tag, hmac.new(mac, nonce + body, "sha256").digest()[:16]):
        return None
    return bytes(a ^ b for a, b in zip(body, _keystream(enc, nonce, len(body))))


# ---------- what the DHT speaks ----------
def bencode(v):
    if isinstance(v, int):
        return b"i%de" % v
    if isinstance(v, str):
        v = v.encode()
    if isinstance(v, bytes):
        return b"%d:%s" % (len(v), v)
    if isinstance(v, (list, tuple)):
        return b"l" + b"".join(bencode(x) for x in v) + b"e"
    return b"d" + b"".join(bencode(k) + bencode(v[k]) for k in sorted(v)) + b"e"


def bdecode(data, i=0, depth=0):
    """(value, next index). A malformed packet raises ValueError."""
    if depth > 8 or i >= len(data):
        raise ValueError("bad bencode")
    c = data[i:i + 1]
    if c == b"i":
        end = data.index(b"e", i)
        return int(data[i + 1:end]), end + 1
    if c == b"l" or c == b"d":
        i += 1
        items = []
        while data[i:i + 1] != b"e":
            if i >= len(data):
                raise ValueError("bad bencode")
            x, i = bdecode(data, i, depth + 1)
            items.append(x)
        return (items if c == b"l" else dict(zip(items[::2], items[1::2]))), i + 1
    colon = data.index(b":", i)
    size = int(data[i:colon])
    if size < 0 or colon + 1 + size > len(data):
        raise ValueError("bad bencode")
    return data[colon + 1:colon + 1 + size], colon + 1 + size


def dht_key(code):
    return hashlib.sha1(b"vermeil-net-1:" + code.encode()).digest()


def _xor(a, b):
    return int.from_bytes(a, "big") ^ int.from_bytes(b, "big")


class Dht:
    """Just enough of BEP 5 to publish "this code is here" and to look a code up."""

    def __init__(self, send, bootstrap, on_found, pace=lambda code: 45):
        self.send, self.bootstrap, self.on_found, self.pace = send, bootstrap, on_found, pace
        self.id = secrets.token_bytes(20)
        self.nodes = {}                 # node id -> (addr, last heard)
        self.waiting = {}               # transaction id -> (lookup or None, node id or None, sent at)
        self.lookups = {}               # code -> its current search
        self.next_boot = 0
        self.tx = 0

    def _query(self, addr, q, args, lookup=None, node=None):
        self.tx = (self.tx + 1) & 0xffff
        t = struct.pack(">H", self.tx)
        self.waiting[t] = (lookup, node, time.time())
        self.send(bencode({"t": t, "y": "q", "q": q, "a": {"id": self.id, **args}}), addr)

    def watch(self, code):
        if code not in self.lookups:
            self.lookups[code] = {"code": code, "key": dht_key(code), "seen": set(), "tokens": {}, "found": set(), "next": 0, "ends": 0}

    def unwatch(self, code):
        self.lookups.pop(code, None)

    def again(self, code):
        """look now, not at the next round"""
        if code in self.lookups:
            self.lookups[code]["next"] = 0

    def tick(self):
        now = time.time()
        for t in [t for t, w in self.waiting.items() if now - w[2] > 4]:
            self.waiting.pop(t)
        if len(self.nodes) < 8 and now > self.next_boot:
            self.next_boot = now + 8
            for host, port in self.bootstrap:
                threading.Thread(target=self._boot, args=(host, port), daemon=True).start()
        if len(self.nodes) > 400:
            for k in sorted(self.nodes, key=lambda k: self.nodes[k][1])[:100]:
                self.nodes.pop(k)
        for L in self.lookups.values():
            if now >= L["next"]:                        # a new round of asking
                L.update(next=now + self.pace(L["code"]), ends=now + 6, seen=set(), tokens={})
            if now < L["ends"]:
                self._ask(L)
            elif L["tokens"]:
                self._announce(L)

    def _boot(self, host, port):
        try:
            addr = (socket.gethostbyname(host), port)
        except OSError:
            return
        self._query(addr, "find_node", {"target": self.id})

    def _ask(self, L):
        near = sorted(self.nodes, key=lambda n: _xor(n, L["key"]))
        fresh = [n for n in near[:24] if n not in L["seen"]][:3]
        for n in fresh:
            L["seen"].add(n)
            self._query(self.nodes[n][0], "get_peers", {"info_hash": L["key"]}, L, n)

    def _announce(self, L):
        for n, (addr, token) in list(sorted(L["tokens"].items(), key=lambda kv: _xor(kv[0], L["key"])))[:8]:
            self._query(addr, "announce_peer", {"info_hash": L["key"], "port": 1, "implied_port": 1, "token": token})
        L["tokens"] = {}

    def receive(self, data, addr):
        try:
            m, _ = bdecode(data)
            if not isinstance(m, dict):
                return
            if m.get(b"y") == b"q":             # we're a good neighbour: a node that answers nothing gets dropped by the others
                self._answer(m, addr)
                return
            if m.get(b"y") != b"r":
                return
            r = m.get(b"r")
            wait = self.waiting.pop(m.get(b"t"), None)
            if wait is None or not isinstance(r, dict):
                return
            who = r.get(b"id")
            if isinstance(who, bytes) and len(who) == 20:
                self.nodes[who] = (addr, time.time())
            L = wait[0]
            nodes = r.get(b"nodes")
            if isinstance(nodes, bytes):
                for i in range(0, len(nodes) - 25, 26):
                    nid, ip, port = nodes[i:i + 20], socket.inet_ntoa(nodes[i + 20:i + 24]), struct.unpack(">H", nodes[i + 24:i + 26])[0]
                    if port and nid not in self.nodes:
                        self.nodes[nid] = ((ip, port), time.time())
            if L is not None and L is self.lookups.get(L["code"]):
                if isinstance(who, bytes) and isinstance(r.get(b"token"), bytes):
                    L["tokens"][who] = (addr, r[b"token"])
                vals = r.get(b"values")
                if isinstance(vals, list):
                    for v in vals[:64]:
                        if isinstance(v, bytes) and len(v) == 6:
                            found = (socket.inet_ntoa(v[:4]), struct.unpack(">H", v[4:])[0])
                            self.on_found(L["code"], found)
        except (ValueError, OSError, struct.error, TypeError, KeyError):
            return

    def _answer(self, m, addr):
        t, q = m.get(b"t"), m.get(b"q")
        if not isinstance(t, bytes):
            return
        r = {"id": self.id}
        if q in (b"get_peers", b"find_node"):
            r["nodes"] = b""                     # we keep no table for others; an honest empty answer
            if q == b"get_peers":
                r["token"] = b"v1"
        self.send(bencode({"t": t, "y": "r", "r": r}), addr)


class Net:
    def __init__(self, bind="0.0.0.0", port=PORT, beacon_port=BEACON_PORT, bootstrap=None, id_file=None, ban_file=None, internet=None):
        self.bind, self.want_port, self.beacon_port = bind, port, beacon_port
        self.bootstrap = BOOTSTRAP if bootstrap is None else bootstrap
        self.id_file, self.ban_file = id_file or ID_FILE, ban_file or BAN_FILE
        self.lock = threading.RLock()
        self.running = False
        self.sock = self.beacon = self.dht = None
        self.me = self._identity()
        if internet is not None:
            self.me["internet"] = internet
        self.keys, self.peers, self.routes, self.wanted, self.punching = {}, {}, {}, {}, {}
        self.outgoing, self.partial, self.done = {}, {}, {}
        self.inbox, self.guests = [], {}
        self.host, self.place = None, "room"
        self.msg_id = secrets.randbits(31)
        self.rate, self.dh_budget, self.hello_sent = {}, [0, 0], {}
        self.pub_cache = None

    # ---------- who I am ----------
    def _identity(self):
        d = _read(self.id_file)
        try:
            secret = int(d["secret"], 16)
        except (KeyError, TypeError, ValueError):
            secret = secrets.randbits(512) | 1 << 511
            d = {"secret": format(secret, "x"), "name": "Player", "enabled": False, "internet": True, "known": {}}
        pub = pow(2, secret, P)
        d.update(code=code_of(pub))
        d.setdefault("known", {})
        d.setdefault("internet", True)
        self.secret, self.pub = secret, pub
        _write(self.id_file, d)
        return d

    def _save_me(self):
        _write(self.id_file, self.me)

    @property
    def code(self):
        return self.me["code"]

    def set_name(self, name):
        with self.lock:
            self.me["name"] = " ".join(str(name or "").split())[:24] or "Player"
            self._save_me()
        return self.me["name"]

    def set_internet(self, on):
        with self.lock:
            self.me["internet"] = bool(on)
            self._save_me()
            if on and self.running and not self.dht:
                self._start_dht()
            elif not on:
                self.dht = None

    # ---------- on and off ----------
    def start(self):
        with self.lock:
            if self.running:
                return True
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            try:
                s.bind((self.bind, self.want_port))
            except OSError:
                s.bind((self.bind, 0))           # someone else on this PC has the usual one
            self.sock = s
            self.beacon = None
            if self.beacon_port:
                try:
                    b = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    b.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    b.bind((self.bind, self.beacon_port))
                    self.beacon = b
                except OSError:
                    self.beacon = None
            self.running = True
            self.me["enabled"] = True
            self._save_me()
            if self.me.get("internet"):
                self._start_dht()
            threading.Thread(target=self._rx_loop, daemon=True, name="net-rx").start()
            threading.Thread(target=self._tick_loop, daemon=True, name="net-tick").start()
        return True

    def _start_dht(self):
        self.dht = Dht(self._raw, self.bootstrap, self._found, self._pace)
        self.dht.watch(self.code)
        for code in self.wanted:
            self.dht.watch(code)

    def stop(self, forget=False):
        with self.lock:
            self.running = False
            if forget:
                self.me["enabled"] = False
                self._save_me()
            for s in (self.sock, self.beacon):
                try:
                    if s:
                        s.close()
                except OSError:
                    pass
            self.sock = self.beacon = self.dht = None

    @property
    def port(self):
        return self.sock.getsockname()[1] if self.sock else 0

    def _raw(self, data, addr):
        s = self.sock
        if s:
            try:
                s.sendto(data, addr)
            except OSError:
                pass

    # ---------- finding people ----------
    def watch(self, codes):
        """friends to keep an eye out for"""
        with self.lock:
            want = {c for c in map(clean_code, codes or []) if c and c != self.code}
            want = set(sorted(want)[:16])
            for c in set(self.wanted) - want:
                if self.wanted[c] != "now":
                    self.wanted.pop(c)
                    if self.dht:
                        self.dht.unwatch(c)
            for c in want:
                self.wanted.setdefault(c, "friend")
                if self.dht:
                    self.dht.watch(c)

    def connect(self, code):
        code = clean_code(code)
        if not code or code == self.code:
            return False
        with self.lock:
            self.wanted[code] = "now"
            if self.dht:
                self.dht.watch(code)
                self.dht.again(code)
        return True

    def add_route(self, code, address):
        """a direct address, for networks where the automatic way can't get through"""
        code = clean_code(code)
        try:
            host, port = str(address).rsplit(":", 1)
            addr = (socket.gethostbyname(host.strip("[] ")), int(port))
        except (ValueError, OSError):
            return False
        if not code:
            return False
        with self.lock:
            self.wanted[code] = "now"
            self.routes[code] = {"addr": addr, "at": 0, "pinned": True}
        self._hello(addr)
        return True

    def _found(self, code, addr):
        """someone's address, out of the lookup. Both sides keep sending for a while: each router lets the other in once it has seen its own PC reach out"""
        with self.lock:
            if len(self.punching) < 128:
                self.punching[addr] = time.time() + 30
        self._hello(addr)

    def _pace(self, code):
        """seconds until the next look: often while there's someone still to find (and for my own code, which is how they find me)"""
        return 15 if code == self.code or code not in self.routes else 120

    def _hello(self, addr, ack=False):
        now = time.time()
        if ack and now - self.hello_sent.get(addr, 0) < 0.4:
            return
        self.hello_sent[addr] = now
        if len(self.hello_sent) > 512:
            self.hello_sent.clear()
        body = json.dumps({"code": self.code, "name": self.me["name"], "pub": format(self.pub, "x"), "ack": ack}).encode()
        self._raw(b"VN1H" + body, addr)

    def _on_hello(self, data, addr):
        try:
            d = json.loads(data[4:])
            code, pub = clean_code(d["code"]), int(d["pub"], 16)
        except (ValueError, KeyError, TypeError):
            return
        if not code or code == self.code or not 1 < pub < P - 1 or code_of(pub) != code:
            return
        with self.lock:
            known = self.me["known"].get(code)
            if known and known != d["pub"]:
                return                           # not the person we met under this code
            if not known and (code in self.wanted or len(self.peers) < 256):
                self.me["known"][code] = d["pub"]
                if len(self.me["known"]) > 2000:
                    self.me["known"].pop(next(iter(self.me["known"])))
                self._save_me()
            self.peers[code] = {"name": str(d.get("name") or "Player")[:24], "seen": time.time(), "pub": pub}
            r = self.routes.get(code)
            lan, was_lan = _private(addr[0]), bool(r and _private(r["addr"][0]) and time.time() - r["at"] < 20)
            if not (r and r.get("pinned") and r["addr"] != addr) and (not was_lan or lan):
                self.routes[code] = {"addr": addr, "at": time.time()}
            elif r:
                r["at"] = time.time()
        if not d.get("ack"):
            self._hello(addr, ack=True)

    def _key(self, code):
        k = self.keys.get(code)
        if k:
            return k
        p = self.peers.get(code)
        pub = p["pub"] if p else None
        if pub is None:
            return None
        now = int(time.time())                   # the sum is costly: a stranger can't make us do it all day
        if self.dh_budget[0] != now:
            self.dh_budget = [now, 0]
        if self.dh_budget[1] >= 20:
            return None
        self.dh_budget[1] += 1
        shared = pow(pub, self.secret, P)
        k = hashlib.sha256(b"vermeil-key:" + shared.to_bytes(256, "big")).digest()
        self.keys[code] = k
        return k

    # ---------- sending ----------
    def send(self, to, msg, loose=False):
        """loose: positions and the like, sent once and fine to lose. Anything else is delivered or reported as send_fail."""
        to = clean_code(to)
        if not to or not isinstance(msg, dict) or msg.get("kind") not in KINDS:
            return {"error": "That can't be sent."}
        if not self.running:
            return {"error": "Friends and visits are switched off."}
        raw = zlib.compress(json.dumps(msg, separators=(",", ":")).encode(), 6)
        if len(raw) > MAX_MESSAGE:
            return {"error": "That's too big to send."}
        with self.lock:
            r = self.routes.get(to)
            if loose:
                if r and len(raw) <= CHUNK:
                    self._seal_send(to, b"U" + raw)
                return {"ok": True}
            self.msg_id = (self.msg_id + 1) & 0x7fffffff
            parts = [raw[i:i + CHUNK] for i in range(0, len(raw), CHUNK)] or [b""]
            self.outgoing[(to, self.msg_id)] = {"to": to, "id": self.msg_id, "parts": parts, "acked": set(), "tries": {}, "at": {}, "born": time.time(), "kind": msg.get("kind")}
            self.wanted.setdefault(to, "now")
            if self.dht and not r:
                self.dht.watch(to)
                self.dht.again(to)
            return {"ok": True, "queued": not r}

    def _seal_send(self, to, plain):
        key, r = self._key(to), self.routes.get(to)
        if not key or not r:
            return False
        self._raw(b"VN1D" + self.code.encode() + seal(key, plain), r["addr"])
        return True

    def _pump(self):
        now = time.time()
        with self.lock:
            for k, m in list(self.outgoing.items()):
                r = self.routes.get(m["to"])
                if now - m["born"] > QUEUE_SECONDS or any(t > RETRIES for t in m["tries"].values()):
                    self.outgoing.pop(k)
                    self.inbox.append({"kind": "send_fail", "from": m["to"], "about": m["kind"], "t": now})
                    continue
                if not r:
                    continue
                sent = 0
                for i, part in enumerate(m["parts"]):
                    if i in m["acked"] or now - m["at"].get(i, 0) < RETRY_SECONDS:
                        continue
                    if sent >= 48:
                        break
                    m["at"][i] = now
                    m["tries"][i] = m["tries"].get(i, 0) + 1
                    self._seal_send(m["to"], b"R" + struct.pack(">IHH", m["id"], i, len(m["parts"])) + part)
                    sent += 1

    # ---------- receiving ----------
    def _rx_loop(self):
        while self.running:
            socks = [s for s in (self.sock, self.beacon) if s]
            try:
                ready, _, _ = select.select(socks, [], [], 0.25)
            except (OSError, ValueError):
                if not self.running:
                    return
                time.sleep(0.05)
                continue
            for s in ready:
                try:
                    data, addr = s.recvfrom(65535)
                except OSError:                  # Windows reports "that port was closed" here: nothing to do with us
                    continue
                try:
                    self._on_packet(data, addr)
                except Exception as e:           # one bad packet never stops the rest
                    print("[net] packet:", e)

    def _on_packet(self, data, addr):
        if data[:4] == b"VN1H":
            self._on_hello(data, addr)
        elif data[:4] == b"VN1B":
            self._on_beacon(data, addr)
        elif data[:4] == b"VN1D":
            self._on_data(data, addr)
        elif data[:1] == b"d":
            d = self.dht
            if d:
                with self.lock:
                    d.receive(data, addr)

    def _on_beacon(self, data, addr):
        try:
            d = json.loads(data[4:])
            port = int(d["port"])
        except (ValueError, KeyError, TypeError):
            return
        if clean_code(d.get("code")) and clean_code(d.get("code")) != self.code and 0 < port < 65536:
            self._hello((addr[0], port), ack=True)

    def _on_data(self, data, addr):
        code = data[4:10].decode("ascii", "ignore")
        with self.lock:
            now = time.time()
            r = self.rate.setdefault(code, [now, 0])
            if now - r[0] > 1:
                r[0], r[1] = now, 0
            r[1] += 1
            if r[1] > 3000:
                return
            key = self._key(code)
            if not key:
                self._hello(addr, ack=True)      # I don't know you yet: say hello first
                return
            plain = unseal(key, data[10:])
            if plain is None:
                return
            route = self.routes.get(code)
            if route:
                route["at"] = now
            if code in self.peers:
                self.peers[code]["seen"] = now
            head = plain[:1]
            if head == b"U":
                self._deliver(code, plain[1:])
            elif head == b"A":
                mid, i = struct.unpack(">IH", plain[1:7])
                m = self.outgoing.get((code, mid))
                if m:
                    m["acked"].add(i)
                    if len(m["acked"]) >= len(m["parts"]):
                        self.outgoing.pop((code, mid))
            elif head == b"R":
                mid, i, total = struct.unpack(">IHH", plain[1:9])
                self._seal_send(code, b"A" + struct.pack(">IH", mid, i))
                if (code, mid) in self.done or not total or i >= total or total * CHUNK > MAX_MESSAGE + CHUNK:
                    return
                held = self.partial.setdefault((code, mid), {"parts": {}, "total": total, "at": now})
                held["parts"][i] = plain[9:]
                held["at"] = now
                if len(held["parts"]) == total:
                    self.partial.pop((code, mid))
                    self.done[(code, mid)] = now
                    self._deliver(code, b"".join(held["parts"][n] for n in range(total)))

    def _deliver(self, code, raw):
        try:
            d = zlib.decompressobj()
            text = d.decompress(raw, MAX_MESSAGE * 4)
            if d.unconsumed_tail:
                return
            msg = json.loads(text)
        except (zlib.error, ValueError):
            return
        if not isinstance(msg, dict) or msg.get("kind") not in KINDS:
            return
        kind = msg["kind"]
        if kind in BLOCKED_BY_BAN and self.banned(code):
            if kind == "join":
                self._deny(code, msg, "You can't join this person's room right now.")
            return
        if kind == "join" and not self._admit(code, msg):
            return
        if kind == "leave":
            self.guests.pop(code, None)
        guest, host = code in self.guests, code == self.host
        if kind in GUEST_ONLY and kind in HOST_ONLY:
            if not guest and not host:
                return
        elif kind in GUEST_ONLY and not guest and kind != "leave":
            return
        elif kind in HOST_ONLY and not host:
            return
        msg["from"] = code
        msg["name"] = self.peers.get(code, {}).get("name", "Player")
        msg["t"] = time.time()
        if kind.endswith("pos"):                 # only the newest place matters
            self.inbox = [m for m in self.inbox if not (m.get("kind") == kind and m.get("from") == code and m.get("id") == msg.get("id"))]
        self.inbox.append(msg)
        if len(self.inbox) > 2000:
            self.inbox = self.inbox[-1500:]

    def _deny(self, code, msg, why):
        self.send(code, {"kind": "farm.no" if msg.get("place") == "farm" else "join_no", "why": why})

    def _admit(self, code, msg):
        want = msg.get("place") or self.place
        if want != self.place:
            self._deny_mismatch(code, want)
            return False
        if code not in self.guests and len(self.guests) >= MAX_GUESTS:
            self._deny(code, {"place": want}, "It's full there right now.")
            return False
        self.guests[code] = {"name": self.peers.get(code, {}).get("name", "Player"), "place": want, "at": time.time()}
        msg["place"] = want
        return True

    def _deny_mismatch(self, code, want):
        self._deny(code, {"place": want}, "They're not there any more.")

    # ---------- visits ----------
    def set_place(self, place):
        """where I am: the main room or the farm. Anyone visiting the other one is sent home, since I've left it."""
        with self.lock:
            self.place = "farm" if place == "farm" else "room"
            for code, g in list(self.guests.items()):
                if g["place"] != self.place:
                    self.guests.pop(code)
                    self.send(code, {"kind": "kick", "why": "The host went somewhere else."})

    def visit(self, code):
        """who I'm visiting (None: nobody): they alone may move things around in my window"""
        with self.lock:
            self.host = clean_code(code) or None
            if self.host:
                self.connect(self.host)

    def kick(self, code, why="The host asked you to leave."):
        with self.lock:
            self.guests.pop(code, None)
            return self.send(code, {"kind": "kick", "why": str(why)[:120]})

    # ---------- bans: for a day, then they lift by themselves ----------
    def bans(self):
        with self.lock:
            d, now = _read(self.ban_file), time.time()
            live = {c: b for c, b in d.items() if isinstance(b, dict) and b.get("until", 0) > now}
            if len(live) != len(d):
                _write(self.ban_file, live)
            return live

    def banned(self, code):
        return code in self.bans()

    def ban(self, code, name=""):
        code = clean_code(code)
        if not code:
            return {"error": "That isn't a code."}
        with self.lock:
            d = self.bans()
            d[code] = {"name": str(name or code)[:24], "until": time.time() + BAN_SECONDS}
            _write(self.ban_file, d)
            if self.running and code in self.guests:
                self.kick(code, "The host banned you from this room for a day.")
        return {"ok": True, "until": d[code]["until"]}

    def unban(self, code):
        with self.lock:
            d = self.bans()
            d.pop(code, None)
            _write(self.ban_file, d)
        return {"ok": True}

    # ---------- the page's view ----------
    def poll(self, only=None, skip=None):
        """what's arrived. only / skip: kinds (or the start of them, "farm.") this page wants or leaves for the other page"""
        def wanted(m):
            k = m.get("kind", "")
            if only is not None and not any(k.startswith(x) for x in only):
                return False
            return skip is None or not any(k.startswith(x) for x in skip)
        with self.lock:
            out = [m for m in self.inbox if wanted(m)]
            self.inbox = [m for m in self.inbox if not wanted(m)]
            return {"msgs": out, "online": self.online(), "guests": dict(self.guests), "host": self.host}

    def online(self):
        now = time.time()
        return {c: p["name"] for c, p in self.peers.items() if now - p["seen"] < 45 and c in self.routes}

    def status(self):
        with self.lock:
            dht = self.dht
            return {"code": self.code, "name": self.me["name"], "enabled": bool(self.me.get("enabled")), "running": self.running,
                    "internet": bool(self.me.get("internet")), "port": self.port, "searching": bool(dht and dht.nodes), "nodes": len(dht.nodes) if dht else 0,
                    "online": self.online(), "place": self.place, "host": self.host, "guests": dict(self.guests), "bans": self.bans(), "maxGuests": MAX_GUESTS}

    # ---------- the steady beat ----------
    def _broadcasts(self):
        out = {"255.255.255.255"}
        try:
            for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
                if _private(ip) and not ip.startswith("127."):
                    out.add(ip.rsplit(".", 1)[0] + ".255")
        except OSError:
            pass
        return out

    def _tick_loop(self):
        beat = hello = 0
        while self.running:
            time.sleep(0.05)
            try:
                self._pump()
                now = time.time()
                if now >= hello:
                    hello = now + 1.0
                    self._keep_routes(now)
                    with self.lock:
                        if self.dht:
                            self.dht.tick()
                    self._forget_old(now)
                if now >= beat and self.beacon_port and self.bind == "0.0.0.0":
                    beat = now + 4
                    body = b"VN1B" + json.dumps({"code": self.code, "port": self.port}).encode()
                    for ip in self._broadcasts():
                        self._raw(body, (ip, self.beacon_port))
            except Exception as e:
                print("[net] tick:", e)

    def _keep_routes(self, now):
        """a router forgets a quiet connection in about half a minute: a small hello keeps the way open"""
        with self.lock:
            known = {tuple(r["addr"]) for r in self.routes.values() if r["at"]}
            for addr, until in list(self.punching.items()):
                if now > until or addr in known:
                    self.punching.pop(addr)
                else:
                    self._hello(addr)
            for code, r in list(self.routes.items()):
                if code in self.wanted or code in self.guests or code == self.host:
                    if now - r.get("beat", 0) > 12 or r["at"] == 0:
                        r["beat"] = now
                        self._hello(r["addr"])
                elif now - r["at"] > 120 and not r.get("pinned"):
                    self.routes.pop(code)

    def _forget_old(self, now):
        with self.lock:
            for k in [k for k, h in self.partial.items() if now - h["at"] > 30]:
                self.partial.pop(k)
            for k in [k for k, t in self.done.items() if now - t > 120]:
                self.done.pop(k)


_net = None
_net_lock = threading.Lock()


def net():
    global _net
    with _net_lock:
        if _net is None:
            _net = Net()
        return _net
