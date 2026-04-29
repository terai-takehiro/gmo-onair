"""Speech-to-Text V2 (Chirp 3) async streaming wrapper.

Consumes 16kHz mono LINEAR16 PCM bytes from a queue and yields interim and
final transcripts.

Notes:
- Speech Adaptation boost phrases come from the glossary (REQUIREMENTS §4.2).
- We never opt-in to data logging, so customer audio is not used for training.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import AsyncIterator

from google.cloud.speech_v2 import SpeechAsyncClient
from google.cloud.speech_v2.types import cloud_speech

from app.config import Settings


SAMPLE_RATE = 16000


@dataclass(frozen=True)
class TranscriptEvent:
    text: str
    is_final: bool
    t_ms: float


def _build_config(
    settings: Settings, boost_phrases: list[str]
) -> cloud_speech.StreamingRecognitionConfig:
    rc = cloud_speech.RecognitionConfig(
        explicit_decoding_config=cloud_speech.ExplicitDecodingConfig(
            encoding=cloud_speech.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            audio_channel_count=1,
        ),
        language_codes=[settings.stt_language],
        model=settings.stt_model,
    )
    if boost_phrases:
        rc.adaptation = cloud_speech.SpeechAdaptation(
            phrase_sets=[
                cloud_speech.SpeechAdaptation.AdaptationPhraseSet(
                    inline_phrase_set=cloud_speech.PhraseSet(
                        phrases=[
                            cloud_speech.PhraseSet.Phrase(value=p, boost=15.0)
                            for p in boost_phrases[:500]
                        ]
                    )
                )
            ]
        )
    return cloud_speech.StreamingRecognitionConfig(
        config=rc,
        streaming_features=cloud_speech.StreamingRecognitionFeatures(
            interim_results=True,
        ),
    )


async def _request_iter(
    settings: Settings,
    audio_iter: AsyncIterator[bytes],
    boost_phrases: list[str],
) -> AsyncIterator[cloud_speech.StreamingRecognizeRequest]:
    yield cloud_speech.StreamingRecognizeRequest(
        recognizer=(
            f"projects/{settings.gcp_project_id}/"
            f"locations/{settings.stt_region}/recognizers/_"
        ),
        streaming_config=_build_config(settings, boost_phrases),
    )
    async for chunk in audio_iter:
        if chunk:
            yield cloud_speech.StreamingRecognizeRequest(audio=chunk)


async def stream_recognize(
    settings: Settings,
    audio_iter: AsyncIterator[bytes],
    boost_phrases: list[str] | None = None,
) -> AsyncIterator[TranscriptEvent]:
    client = SpeechAsyncClient()
    requests = _request_iter(settings, audio_iter, boost_phrases or [])
    responses = await client.streaming_recognize(requests=requests)
    t0 = time.perf_counter()
    async for resp in responses:
        for r in resp.results:
            if not r.alternatives:
                continue
            text = r.alternatives[0].transcript
            if not text.strip():
                continue
            yield TranscriptEvent(
                text=text,
                is_final=r.is_final,
                t_ms=(time.perf_counter() - t0) * 1000,
            )
