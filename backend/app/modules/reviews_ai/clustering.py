"""HDBSCAN-кластеризация embeddings отзывов.

cluster_embeddings — основной интерфейс: получает массив векторов, возвращает
массив меток (целые: 0..N для кластеров, -1 для «шума»).

compute_centroid — среднее по embeddings кластера. Используется как «центр»
PainTag в БД, по нему матчатся новые отзывы через cosine similarity.
"""

from __future__ import annotations

import numpy as np


def cluster_embeddings(
    embeddings: np.ndarray,
    min_cluster_size: int = 8,
    min_samples: int = 4,
) -> np.ndarray:
    """Кластеризует векторы HDBSCAN.

    Args:
        embeddings: shape (N, D). Если N < min_cluster_size — возвращает массив -1.
        min_cluster_size: минимальный размер кластера. Меньшие группы → шум.
        min_samples: насколько «плотным» должен быть кластер.

    Returns:
        labels: shape (N,) — индексы кластеров (-1 для шумовых точек).
    """
    if embeddings is None or len(embeddings) == 0:
        return np.array([], dtype=int)

    arr = np.asarray(embeddings, dtype=np.float64)
    if arr.shape[0] < min_cluster_size:
        return np.full(arr.shape[0], -1, dtype=int)

    # импорт внутри функции: hdbscan тяжёлый, не нужен при каждом импорте модуля
    import hdbscan

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="euclidean",
        cluster_selection_method="eom",
    )
    return clusterer.fit_predict(arr)


def compute_centroid(embeddings: np.ndarray) -> np.ndarray:
    """Центроид = среднее по embeddings (по нулевой оси).

    Для cosine similarity нормализованные векторы дают тот же ranking,
    что и эвклидов центроид, поэтому отдельная нормализация здесь не нужна —
    pgvector vector_cosine_ops сам нормализует при сравнении.
    """
    arr = np.asarray(embeddings, dtype=np.float64)
    if arr.ndim != 2 or arr.shape[0] == 0:
        raise ValueError("embeddings must be 2D ndarray with at least 1 row")
    return arr.mean(axis=0)
