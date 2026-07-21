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
from abc import ABC, abstractmethod
from typing import Callable


class DesignGenerator(ABC):
    @abstractmethod
    def generate(self, reference_path: str, prompt: str, model: str, quality: str) -> bytes:
        """A single generation request. Returns the bytes of the finished
        image (PNG). Retries/backoff are the caller's responsibility
        (GenerationQueue), not a specific provider's."""


class OpenAIDesignGenerator(DesignGenerator):
    def __init__(self, api_key_provider: Callable[[], str]):
        self._api_key_provider = api_key_provider

    def generate(self, reference_path: str, prompt: str, model: str, quality: str) -> bytes:
        from openai import OpenAI
        client = OpenAI(api_key=self._api_key_provider())
        with open(reference_path, "rb") as img_file:
            result = client.images.edit(
                model=model, image=img_file, prompt=prompt, size="auto", quality=quality)
        return base64.b64decode(result.data[0].b64_json)
