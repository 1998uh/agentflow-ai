from pydantic import BaseModel, Field


class RequirementsAnalyzeRequest(BaseModel):
    """POST /api/requirements/analyze 请求体。"""

    description: str = Field(
        min_length=1,
        description="一段自然语言需求描述",
    )


class RequirementsAnalysis(BaseModel):
    """模型输出经 Pydantic 校验后的结构化需求分析。"""

    summary: str = Field(description="需求摘要")
    user_stories: list[str] = Field(
        min_length=1,
        description="用户故事列表",
    )
    acceptance_criteria: list[str] = Field(
        min_length=1,
        description="验收标准",
    )
    risks: list[str] = Field(
        default_factory=list,
        description="风险点与待澄清项",
    )


class RequirementsAnalyzeResponse(BaseModel):
    analysis: RequirementsAnalysis
    model: str
    mocked: bool = False
