"""Offline routing regressions. Provider calls and persistence are mocked."""
import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import agent
from models import ModelConfigurationError, model_settings


class ModelSelectionTests(unittest.TestCase):
    @patch.dict(os.environ, {"OPENROUTER_API_KEY": "test", "LLM_ALLOW_PAID": "true"}, clear=True)
    def test_aliases_resolve_identically_for_both_agent_roles(self):
        for alias, expected in (("model-1", "openai/gpt-6.1-sol"), ("model-2", "anthropic/claude-opus-5.5")):
            for role in ("main", "port"):
                settings = model_settings(role, alias)
                self.assertEqual(settings["model"], expected)
                self.assertEqual(settings["provider"], "openrouter")
        with self.assertRaises(ModelConfigurationError):
            model_settings("main", "openai/gpt-6.1-sol")

    @patch.dict(os.environ, {"OPENROUTER_API_KEY": "test"}, clear=True)
    def test_selection_preserves_explicit_paid_opt_in(self):
        with self.assertRaises(ModelConfigurationError):
            model_settings("main", "model-1")

    def test_caches_separate_models(self):
        agent._get_main_agent.cache_clear()
        with patch.dict(agent._port_agent_cache, {}, clear=True), \
             patch("agent.create_chat_model") as create_model, \
             patch("agent.create_react_agent", side_effect=lambda *a, **k: object()):
            try:
                main_one = agent._get_main_agent("model-1")
                main_two = agent._get_main_agent("model-2")
                self.assertIsNot(main_one, main_two)
                self.assertIs(main_one, agent._get_main_agent("model-1"))
                port_one = agent._get_port_agent("mumbai", "Mumbai", "model-1")
                port_two = agent._get_port_agent("mumbai", "Mumbai", "model-2")
                self.assertIsNot(port_one, port_two)
                self.assertIs(port_two, agent._get_port_agent("mumbai", "Mumbai", "model-2"))
                self.assertEqual([c.kwargs["model_choice"] for c in create_model.call_args_list],
                                 ["model-1", "model-2", "model-1", "model-2"])
            finally:
                agent._get_main_agent.cache_clear()

    def test_api_accepts_only_aliases_and_forwards_both_request_types(self):
        import main
        from fastapi.responses import JSONResponse
        from fastapi.testclient import TestClient
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        main.app.dependency_overrides[main.get_current_user] = lambda: {"sub": "test-user"}
        try:
            with patch("main.get_db", return_value=db), patch("main._verify_conversation"), \
                 patch("main._load_lc_messages", return_value=[]), \
                 patch("main._sse_stream", return_value=JSONResponse({"ok": True})) as stream, \
                 TestClient(main.app) as client:
                for endpoint, payload in (("stream", {"message": "Hello"}),
                                          ("form_response", {"tool_call_id": "test-tool"})):
                    for alias in ("model-1", "model-2"):
                        response = client.post(f"/conversations/test/{endpoint}", json={**payload, "model": alias})
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(stream.call_args.kwargs["model_choice"], alias)
                    stream.reset_mock()
                    response = client.post(f"/conversations/test/{endpoint}", json={**payload, "model": "openai/gpt-6.1-sol"})
                    self.assertEqual(response.status_code, 422)
                    stream.assert_not_called()
                    response = client.post(f"/conversations/test/{endpoint}", json=payload)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(stream.call_args.kwargs["model_choice"], "model-1")
        finally:
            main.app.dependency_overrides.clear()


class ModelStreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_streams_keep_their_selection(self):
        seen = []

        class FakeAgent:
            def __init__(self, alias):
                self.alias = alias

            async def astream_events(self, messages, config, version):
                await asyncio.sleep(0)
                seen.append((self.alias, config["configurable"]["chat_model"]))
                if False:
                    yield

        async def consume(alias):
            return [event async for event in agent.stream_response([], alias)]

        with patch("agent._get_main_agent", side_effect=FakeAgent):
            await asyncio.gather(consume("model-1"), consume("model-2"))
        self.assertCountEqual(seen, [("model-1", "model-1"), ("model-2", "model-2")])

    async def test_specialist_receives_selection_without_exposing_it_as_tool_input(self):
        self.assertNotIn("config", agent.consult_port_agent.tool_call_schema.model_fields)
        specialist = MagicMock(ainvoke=AsyncMock(return_value={"messages": []}))
        with patch("agent._get_port_agent", return_value=specialist) as get_port:
            await agent.consult_port_agent.ainvoke(
                {"port_name": "mumbai", "query": "test"},
                config={"configurable": {"chat_model": "model-2"}},
            )
        get_port.assert_called_once_with("mumbai", "Mumbai", "model-2")

    async def test_configuration_error_does_not_expose_provider(self):
        from main import _sse_stream

        async def failing_stream(*args):
            raise ModelConfigurationError("private provider/model identifier")
            yield

        with patch("main.stream_response", side_effect=failing_stream):
            response = _sse_stream(MagicMock(), "test", [], model_choice="model-2")
            body = "".join([part async for part in response.body_iterator])
        self.assertIn("selected model is unavailable", body)
        self.assertNotIn("private provider", body)
