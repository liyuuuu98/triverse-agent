from pydantic import BaseModel

from triverse_agent.token_usage_compat import install_token_detail_fallback


class _UsageDetail(BaseModel):
    cache_creation_tokens: int | None = None
    cached_tokens: int | None = None

    def __delattr__(self, name: str) -> None:
        if name in type(self).model_fields and name in self.__dict__:
            object.__delattr__(self, name)
            return
        super().__delattr__(name)


def test_deleted_usage_field_reads_as_absent() -> None:
    detail = _UsageDetail(cache_creation_tokens=None, cached_tokens=4)
    assert "cache_creation_tokens" in detail.model_fields_set
    del detail.cache_creation_tokens
    assert "cache_creation_tokens" in detail.model_fields_set
    try:
        detail.cache_creation_tokens  # noqa: B018
    except AttributeError:
        pass
    else:
        raise AssertionError("deleted field must raise before the fallback")
    install_token_detail_fallback([_UsageDetail])
    install_token_detail_fallback([_UsageDetail])
    assert detail.cache_creation_tokens is None
    assert int(detail.cache_creation_tokens or 0) == 0
    assert detail.cached_tokens == 4


def test_unknown_attribute_still_raises() -> None:
    detail = _UsageDetail()
    install_token_detail_fallback([_UsageDetail])
    try:
        detail.not_a_field  # noqa: B018
    except AttributeError:
        return
    raise AssertionError("missing attributes must still raise")
