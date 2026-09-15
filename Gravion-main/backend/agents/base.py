from abc import ABC, abstractmethod
from typing import Any

class BaseAgent(ABC):
    name: str
    description: str
    capabilities: list[str]

    @abstractmethod
    async def execute(self, command: str, model: str = 'qwen2.5:7b-instruct-q4_K_M', history: list = None, **kwargs) -> dict[str, Any]:
        pass
