# -*- coding: utf-8 -*-
"""
Abstraction over the image generation provider.

Today the only implementation (OpenAIDesignGenerator) calls OpenAI's
images.edit. If a different provider is ever needed (a different model, a
different API), it is enough to write a new class with the same
DesignGenerator interface and swap it in container.py - GenerationQueue and
the rest of the code know nothing about OpenAI at all.
"""

import base64
import threading
from abc import ABC, abstractmethod
from typing import Callable


class DesignGenerator(ABC):
    @abstractmethod
    def generate(self, reference_path: str, prompt: str, model: str, quality: str) -> bytes:
        """A single generation request. Returns the bytes of the finished
        image (PNG). Retries/backoff are the caller's responsibility
        (GenerationQueue), not a specific provider's."""


class OpenAIDesignGenerator(DesignGenerator):
    """OpenAI images.edit, with one client reused across generations.

    The client is cached rather than built per call because an OpenAI client
    owns an httpx connection pool: constructing one per image (and this class
    is called once per generation *attempt*, up to max_retries each) leaves a
    pool of sockets behind every time, released only whenever the garbage
    collector happens to finalize it. Reusing one also means the TLS handshake
    to api.openai.com is paid once instead of per image.

    Keyed on the API key so the "credentials are read fresh from settings on
    every request" property is preserved: pasting a new key in Settings
    replaces the client (and closes the old one) on the very next call, no
    restart. An openai.OpenAI is safe to share across threads, so all
    GenerationQueue workers use the same instance."""

    def __init__(self, api_key_provider: Callable[[], str]):
        self._api_key_provider = api_key_provider
        self._lock = threading.Lock()
        self._client = None
        self._client_key = None

    def _get_client(self):
        from openai import OpenAI
        api_key = self._api_key_provider()
        with self._lock:
            if self._client is None or self._client_key != api_key:
                old = self._client
                self._client = OpenAI(api_key=api_key)
                self._client_key = api_key
                if old is not None:
                    # Best effort: an in-flight request on the old client (a
                    # worker mid-generation when the key changed) would raise
                    # here, and that must not break the caller that is merely
                    # asking for a client.
                    try:
                        old.close()
                    except Exception:  # noqa: BLE001
                        pass
            return self._client

    def generate(self, reference_path: str, prompt: str, model: str, quality: str) -> bytes:
        client = self._get_client()
        with open(reference_path, "rb") as img_file:
            result = client.images.edit(
                model=model, image=img_file, prompt=prompt, size="auto", quality=quality)
        return base64.b64decode(result.data[0].b64_json)
