"""Тесты HDBSCAN-кластеризации и центроидов."""

import numpy as np
import pytest

from app.modules.reviews_ai.clustering import cluster_embeddings, compute_centroid


def _make_three_clusters(rng_seed: int = 42, n_per: int = 10, dim: int = 8) -> np.ndarray:
    """Три плотных кластера в разных углах + лёгкий шум."""
    rng = np.random.default_rng(rng_seed)
    centers = np.eye(3, dim) * 2.0
    parts = [centers[i] + rng.normal(0, 0.05, size=(n_per, dim)) for i in range(3)]
    return np.vstack(parts)


def test_hdbscan_clusters_similar_texts():
    X = _make_three_clusters()
    labels = cluster_embeddings(X, min_cluster_size=5, min_samples=2)
    n_clusters = len({l for l in labels if l >= 0})
    assert n_clusters == 3
    # каждая точка отнесена куда-то (-1 или 0..2)
    assert len(labels) == X.shape[0]


def test_hdbscan_returns_minus_one_for_too_few_points():
    # 3 точки при min_cluster_size=8 → все шум
    X = np.random.RandomState(1).randn(3, 8)
    labels = cluster_embeddings(X, min_cluster_size=8)
    assert list(labels) == [-1, -1, -1]


def test_hdbscan_handles_empty_input():
    labels = cluster_embeddings(np.zeros((0, 5)))
    assert labels.shape == (0,)


def test_centroid_computation():
    X = np.array([[1.0, 0.0], [3.0, 0.0], [2.0, 4.0]])
    c = compute_centroid(X)
    assert c.shape == (2,)
    assert c[0] == pytest.approx(2.0)
    assert c[1] == pytest.approx(4.0 / 3)


def test_centroid_raises_on_empty():
    with pytest.raises(ValueError):
        compute_centroid(np.zeros((0, 5)))
