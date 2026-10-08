"""Offline regressions. No paid calls, real credentials, or live tariff claims."""
import os
import time
import unittest
from unittest.mock import AsyncMock, patch

from calculator import calculate
from models import ModelConfigurationError, create_chat_model, model_settings


class CalculatorTests(unittest.TestCase):
    def test_decimal_tariff_with_tax_and_started_day(self):
        self.assertEqual(calculate("round(15000 * 0.125 * ceil(25/24) * 1.18, 2)"), "4425.00")
        self.assertEqual(calculate("0.1 + 0.2"), "0.3")
        self.assertEqual(calculate("round(2.675, 2)"), "2.68")

    def test_minimum_charge(self):
        self.assertEqual(calculate("max(500, 100 * 0.5) + min(12, 20)"), "512")

    def test_reject_code_and_resource_abuse(self):
        for expression in ["__import__('os').environ", "open('/etc/passwd')", "(1).__class__",
                           "[1]*100000000", "2**100000", "1e999", "True", "x + 1", "1/0",
                           "round(1, 100000)", "1e-101", "0e-101", "1+"*1000 + "1"]:
            with self.subTest(expression=expression[:40]):
                with self.assertRaises((ValueError, SyntaxError)):
                    calculate(expression)


class ModelTests(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def test_missing_key_is_explicit(self):
        with self.assertRaisesRegex(ModelConfigurationError, "OPENROUTER_API_KEY"):
            model_settings("main")

    @patch.dict(os.environ, {"OPENROUTER_API_KEY": "synthetic-test-key"}, clear=True)
    def test_free_default_and_tool_binding(self):
        from agent import calculate_charges
        model = create_chat_model("main", streaming=True)
        self.assertEqual(model_settings("main")["model"], "inclusionai/ling-3.0-flash-sante:free")
        self.assertEqual(model.openrouter_provider["max_price"]["prompt"], 0)
        self.assertTrue(model.openrouter_provider["zdr"])
        self.assertEqual(model.request_timeout, 60_000)
        self.assertEqual(model.max_retries, 0)
        self.assertTrue(model.bind_tools([calculate_charges]))

    def test_paid_endpoints_rejected_by_default(self):
        for env in ({"MAIN_MODEL": "openai/gpt-oss-120b"}, {"LLM_PROVIDER": "anthropic"}):
            with patch.dict(os.environ, env, clear=True):
                with self.assertRaisesRegex(ModelConfigurationError, "LLM_ALLOW_PAID"):
                    model_settings("main")


class AgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_port_traversal_rejected_without_model_access(self):
        from agent import consult_port_agent
        for slug in ("..", "../..", "/tmp", "mumbai/../../"):
            response = await consult_port_agent.ainvoke({"port_name": slug, "query": "read documents"})
            self.assertIn("No data found", response)

    @patch.dict(os.environ, {}, clear=True)
    async def test_missing_vessel_key_asks_for_manual_data(self):
        from agent import get_vessel, search_vessels
        self.assertIn("Ask the user", await get_vessel.ainvoke({"id": "1234567"}))
        self.assertIn("Ask the user", await search_vessels.ainvoke({"query": "test"}))

    async def test_only_main_model_text_streamed(self):
        from langchain_core.messages import AIMessageChunk
        from agent import stream_response
        class FakeAgent:
            async def astream_events(self, *args, **kwargs):
                for tag, content in [("port_model", "private intermediate"), ("main_model", "Final answer")]:
                    yield {"event": "on_chat_model_stream", "tags": [tag], "data": {"chunk": AIMessageChunk(content=content)}}
        with patch("agent._get_main_agent", return_value=FakeAgent()):
            events = [event async for event in stream_response([])]
        self.assertEqual(events, [{"type": "text", "text": "Final answer"}])


class AuthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        from jose import jwk
        self.private = ec.generate_private_key(ec.SECP256R1()).private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        self.key = jwk.construct(self.private, "ES256").public_key().to_dict()
        self.key["kid"] = "test-key"

    def token(self, **changes):
        from jose import jwt
        claims = {"sub": "test-user", "role": "authenticated", "aud": "authenticated",
                  "iss": "https://test.supabase.co/auth/v1", "exp": int(time.time()) + 60}
        claims.update(changes)
        return jwt.encode(claims, self.private, algorithm="ES256", headers={"kid": "test-key"})

    @patch.dict(os.environ, {"SUPABASE_URL": "https://test.supabase.co"})
    async def test_signature_and_identity_boundaries(self):
        from auth import verify_token
        from fastapi import HTTPException
        with patch("auth._get_jwks", AsyncMock(return_value={"keys": [self.key]})):
            self.assertEqual((await verify_token(self.token()))["sub"], "test-user")
            for changes in ({"aud": "other"}, {"iss": "https://other.supabase.co/auth/v1"},
                            {"role": "service_role"}, {"exp": int(time.time()) - 60}):
                with self.subTest(changes=changes), self.assertRaises(HTTPException):
                    await verify_token(self.token(**changes))

    async def test_empty_jwks_is_unauthorized(self):
        from auth import verify_token
        from fastapi import HTTPException
        with patch("auth._get_jwks", AsyncMock(return_value={"keys": []})):
            with self.assertRaises(HTTPException) as error:
                await verify_token(self.token())
            self.assertEqual(error.exception.status_code, 401)


class HealthTests(unittest.TestCase):
    def test_health_and_readiness_are_distinct(self):
        from fastapi.testclient import TestClient
        from main import app
        # Import first: main loads .env, which may now contain real local configuration.
        with patch.dict(os.environ, {}, clear=True), TestClient(app) as client:
            self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(client.get("/ready").status_code, 503)
            self.assertIn(client.get("/conversations").status_code, (401, 422))


if __name__ == "__main__":
    unittest.main()
