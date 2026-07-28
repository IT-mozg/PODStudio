# -*- coding: utf-8 -*-
"""models/design_generator.py - the client is reused, not rebuilt per image.

An OpenAI client owns an httpx connection pool. Constructing one per call
(and generate() is called once per generation *attempt*, up to max_retries
per design) left a pool of sockets behind every time, released only when the
garbage collector got round to finalizing it.

openai isn't imported at module scope by the generator (it's a local import
inside _get_client), so these tests patch it in sys.modules and never need
the real package installed."""

import sys
import threading
import types

import pytest

from models.design_generator import OpenAIDesignGenerator


class FakeOpenAI:
    instances: list["FakeOpenAI"] = []

    def __init__(self, api_key):
        self.api_key = api_key
        self.closed = False
        self.images = types.SimpleNamespace(edit=self._edit)
        FakeOpenAI.instances.append(self)

    def _edit(self, **kwargs):
        return types.SimpleNamespace(
            data=[types.SimpleNamespace(b64_json="UE5H")])  # base64 of "PNG"

    def close(self):
        self.closed = True


@pytest.fixture
def fake_openai(monkeypatch):
    FakeOpenAI.instances = []
    monkeypatch.setitem(sys.modules, "openai",
                        types.SimpleNamespace(OpenAI=FakeOpenAI))
    return FakeOpenAI


@pytest.fixture
def reference(tmp_path):
    path = tmp_path / "ref.jpg"
    path.write_bytes(b"JPG")
    return str(path)


def test_client_is_built_once_for_many_generations(fake_openai, reference):
    generator = OpenAIDesignGenerator(api_key_provider=lambda: "sk-test")
    for _ in range(10):
        assert generator.generate(reference, "prompt", "gpt-image-2", "low") == b"PNG"
    assert len(fake_openai.instances) == 1


def test_new_key_replaces_and_closes_the_old_client(fake_openai, reference):
    key = "sk-first"
    generator = OpenAIDesignGenerator(api_key_provider=lambda: key)
    generator.generate(reference, "prompt", "gpt-image-2", "low")

    key = "sk-second"  # the user pastes a new key in Settings
    generator.generate(reference, "prompt", "gpt-image-2", "low")

    assert [c.api_key for c in fake_openai.instances] == ["sk-first", "sk-second"]
    assert fake_openai.instances[0].closed, "the superseded client must be closed"

    key = "sk-first"  # and back again - still no unbounded accumulation
    generator.generate(reference, "prompt", "gpt-image-2", "low")
    assert len(fake_openai.instances) == 3


def test_a_failing_close_does_not_break_the_caller(fake_openai, reference):
    class StubbornClient(FakeOpenAI):
        def close(self):
            raise RuntimeError("request still in flight")

    key = "sk-first"
    generator = OpenAIDesignGenerator(api_key_provider=lambda: key)
    generator._client = StubbornClient("sk-first")
    generator._client_key = "sk-first"

    key = "sk-second"
    assert generator.generate(reference, "prompt", "gpt-image-2", "low") == b"PNG"


def test_concurrent_generations_share_one_client(fake_openai, reference):
    generator = OpenAIDesignGenerator(api_key_provider=lambda: "sk-test")
    start = threading.Barrier(8)

    def run():
        start.wait()
        generator.generate(reference, "prompt", "gpt-image-2", "low")

    threads = [threading.Thread(target=run) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert len(fake_openai.instances) == 1, "the lock must prevent a build race"
