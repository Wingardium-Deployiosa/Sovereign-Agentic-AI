from abc import ABC, abstractmethod
from typing import Any

class BaseAgent(ABC):
    name: str
    description: str
    capabilities: list[str]

    @abstractmethod
    async def execute(self, command: str) -> dict[str, Any]:
        pass
