"""Two Vermeils on one machine, talking over real sockets: invites, visits, bans, big messages, and finding each other through a DHT."""
import os
import socket
import sys
import tempfile
import threading
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in (ROOT, os.path.join(ROOT, "brain"), os.path.join(ROOT, "skills")):
    if p not in sys.path:
        sys.path.insert(0, p)

import netplay
from netplay import P, Net, bdecode, bencode, clean_code, code_of, dht_key, seal, unseal


def wait(test, seconds=8.0):
    end = time.time() + seconds
    while time.time() < end:
        got = test()
        if got:
            return got
        time.sleep(0.02)
    return None


class FakeDhtNode:
    """one node of the public network, on this machine: it remembers who announced what, under the address it saw them from"""

    def __init__(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.settimeout(0.2)
        self.addr = self.sock.getsockname()
        self.peers, self.on = {}, True
        threading.Thread(target=self.run, daemon=True).start()

    def run(self):
        while self.on:
            try:
                data, addr = self.sock.recvfrom(65535)
            except OSError:
                continue
            m, _ = bdecode(data)
            q, a = m[b"q"], m[b"a"]
            r = {"id": b"N" * 20}
            if q == b"get_peers":
                r["token"] = b"tok"
                r["values"] = [socket.inet_aton(ip) + port.to_bytes(2, "big") for ip, port in self.peers.get(a[b"info_hash"], [])]
                r["nodes"] = b""
            elif q == b"announce_peer":
                assert a[b"token"] == b"tok"
                self.peers.setdefault(a[b"info_hash"], set()).add(addr)
            self.sock.sendto(bencode({"t": m[b"t"], "y": "r", "r": r}), addr)


class Base(unittest.TestCase):
    def make(self, bootstrap=(), internet=False):
        d = tempfile.mkdtemp()
        n = Net(bind="127.0.0.1", port=0, beacon_port=0, bootstrap=list(bootstrap), internet=internet,
                id_file=os.path.join(d, "id.json"), ban_file=os.path.join(d, "bans.json"))
        n.start()
        self.addCleanup(n.stop)
        return n

    def pair(self):
        a, b = self.make(), self.make()
        a.add_route(b.code, f"127.0.0.1:{b.port}")
        b.add_route(a.code, f"127.0.0.1:{a.port}")
        self.assertTrue(wait(lambda: a.routes[b.code]["at"] and b.routes[a.code]["at"]))
        return a, b

    def next_msg(self, net, kind):
        box = []
        def look():
            box.extend(net.poll()["msgs"])
            return next((m for m in box if m["kind"] == kind), None)
        return wait(look)


class Codes(unittest.TestCase):
    def test_the_key_group_is_a_safe_prime(self):
        def probably_prime(n):
            d, r = n - 1, 0
            while d % 2 == 0:
                d //= 2; r += 1
            for a in (2, 3, 5, 7, 11, 13, 17, 19):
                x = pow(a, d, n)
                if x in (1, n - 1):
                    continue
                for _ in range(r - 1):
                    x = x * x % n
                    if x == n - 1:
                        break
                else:
                    return False
            return True
        self.assertEqual(P.bit_length(), 2048)
        self.assertTrue(probably_prime(P))
        self.assertTrue(probably_prime((P - 1) // 2))

    def test_codes(self):
        code = code_of(pow(2, 12345, P))
        self.assertEqual(len(code), 6)
        self.assertEqual(clean_code(f" {code.lower()} "), code)
        self.assertEqual(clean_code("abc"), "")

    def test_a_code_stays_with_its_owner(self):
        d = tempfile.mkdtemp()
        a = Net(id_file=os.path.join(d, "i.json"), ban_file=os.path.join(d, "b.json"))
        b = Net(id_file=os.path.join(d, "i.json"), ban_file=os.path.join(d, "b.json"))
        self.assertEqual(a.code, b.code)
        c = Net(id_file=os.path.join(tempfile.mkdtemp(), "i.json"), ban_file=os.path.join(d, "b.json"))
        self.assertNotEqual(a.code, c.code)

    def test_a_tampered_message_is_refused(self):
        key = b"k" * 32
        box = seal(key, b"hello there")
        self.assertEqual(unseal(key, box), b"hello there")
        self.assertIsNone(unseal(key, box[:-1] + bytes([box[-1] ^ 1])))
        self.assertIsNone(unseal(b"x" * 32, box))
        self.assertNotIn(b"hello", box)

    def test_bencode_survives_rubbish(self):
        self.assertEqual(bdecode(bencode({"a": [1, b"x"]}))[0], {b"a": [1, b"x"]})
        for bad in (b"d", b"l", b"99:x", b"i", b"dddddddddddddddddddd"):
            with self.assertRaises(ValueError):
                bdecode(bad)


class Talking(Base):
    def test_friend_request_arrives_with_the_right_sender(self):
        a, b = self.pair()
        self.assertTrue(a.send(b.code, {"kind": "friend_req"}).get("ok"))
        m = self.next_msg(b, "friend_req")
        self.assertEqual(m["from"], a.code)

    def test_big_message_arrives_whole(self):
        a, b = self.pair()
        blob = os.urandom(300 * 1024).hex()      # doesn't compress much: many pieces
        a.send(b.code, {"kind": "dm", "text": blob})
        m = self.next_msg(b, "dm")
        self.assertEqual(m["text"], blob)

    def test_unknown_kinds_are_not_sent(self):
        a, b = self.pair()
        self.assertIn("error", a.send(b.code, {"kind": "rm -rf"}))

    def test_nobody_there_is_reported(self):
        a = self.make()
        old = netplay.QUEUE_SECONDS
        netplay.QUEUE_SECONDS = 0.3
        self.addCleanup(setattr, netplay, "QUEUE_SECONDS", old)
        a.send("ABCDEF", {"kind": "dm", "text": "hi"})
        self.assertEqual(self.next_msg(a, "send_fail")["about"], "dm")

    def test_someone_else_cant_take_a_known_code(self):
        a, b = self.pair()
        c = self.make()
        fake = (b'VN1H{"code":"%s","name":"x","pub":"%s"}' % (b.code.encode(), format(c.pub, "x").encode()))
        a._on_packet(fake, ("127.0.0.1", c.port))
        self.assertEqual(a.peers[b.code]["pub"], b.pub)
        self.assertEqual(a.routes[b.code]["addr"], ("127.0.0.1", b.port))


class Visits(Base):
    def test_join_kick_and_ban_for_a_day(self):
        host, guest = self.pair()
        guest.visit(host.code)
        guest.send(host.code, {"kind": "join", "place": "room"})
        self.assertEqual(self.next_msg(host, "join")["place"], "room")
        self.assertIn(guest.code, host.guests)
        host.send(guest.code, {"kind": "welcome", "layout": {}})
        self.assertTrue(self.next_msg(guest, "welcome"))

        host.kick(guest.code)
        self.assertTrue(self.next_msg(guest, "kick"))
        self.assertNotIn(guest.code, host.guests)

        r = host.ban(guest.code, "Pat")
        self.assertAlmostEqual(r["until"], time.time() + 24 * 3600, delta=5)
        guest.send(host.code, {"kind": "join", "place": "room"})
        self.assertIn("can't join", self.next_msg(guest, "join_no")["why"])
        self.assertNotIn(guest.code, host.guests)

    def test_a_ban_lifts_after_a_day(self):
        host = self.make()
        host.ban("ABCDEF", "Pat")
        self.assertTrue(host.banned("ABCDEF"))
        real = time.time
        try:
            netplay.time.time = lambda: real() + 24 * 3600 + 1
            self.assertFalse(host.banned("ABCDEF"))
            self.assertEqual(host.bans(), {})
        finally:
            netplay.time.time = real

    def test_unban(self):
        host = self.make()
        host.ban("ABCDEF")
        host.unban("ABCDEF")
        self.assertFalse(host.banned("ABCDEF"))

    def test_only_guests_can_act(self):
        host, stranger = self.pair()
        stranger.send(host.code, {"kind": "farm.act", "tool": "hoe"})
        time.sleep(0.4)
        self.assertEqual(host.poll()["msgs"], [])

    def test_only_my_host_can_send_me_home(self):
        guest, stranger = self.pair()
        stranger.send(guest.code, {"kind": "kick", "why": "ha"})
        time.sleep(0.4)
        self.assertEqual(guest.poll()["msgs"], [])

    def test_wrong_place_is_refused(self):
        host, guest = self.pair()
        host.set_place("room")
        guest.visit(host.code)
        guest.send(host.code, {"kind": "join", "place": "farm"})
        self.assertIn("not there", self.next_msg(guest, "farm.no")["why"])

    def test_leaving_for_the_farm_sends_room_guests_home(self):
        host, guest = self.pair()
        guest.visit(host.code)
        guest.send(host.code, {"kind": "join", "place": "room"})
        self.assertTrue(self.next_msg(host, "join"))
        host.set_place("farm")
        self.assertTrue(self.next_msg(guest, "kick"))
        self.assertEqual(host.guests, {})

    def test_poll_leaves_farm_messages_for_the_farm(self):
        host, guest = self.pair()
        guest.visit(host.code)
        host.send(guest.code, {"kind": "farm.no", "why": "x"})
        self.assertTrue(wait(lambda: guest.inbox))
        self.assertEqual(guest.poll(skip=["farm."])["msgs"], [])
        self.assertEqual(guest.poll(only=["farm."])["msgs"][0]["kind"], "farm.no")


class AcrossTheInternet(Base):
    def test_two_pcs_find_each_other_from_just_a_code(self):
        node = FakeDhtNode()
        self.addCleanup(setattr, node, "on", False)
        a = self.make(bootstrap=[("127.0.0.1", node.addr[1])], internet=True)
        b = self.make(bootstrap=[("127.0.0.1", node.addr[1])], internet=True)
        self.assertNotIn(b.code, a.routes)
        a.connect(b.code)
        a.send(b.code, {"kind": "friend_req"})
        got = wait(lambda: b.inbox and b.inbox[0], 30)
        self.assertTrue(got, "the message never arrived through the lookup")
        self.assertEqual(got["from"], a.code)
        self.assertIn(dht_key(b.code), node.peers)


if __name__ == "__main__":
    unittest.main()
