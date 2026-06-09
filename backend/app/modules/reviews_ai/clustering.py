"""HDBSCAN-кластеризация embeddings отзывов.

cluster_embeddings — основной интерфейс: получает массив векторов, возвращает
массив меток (целые: 0..N для кластеров, -1 для «шума»).

compute_centroid — среднее по embeddings кластера. Используется как «центр»
PainTag в БД, по нему матчатся новые отзывы через cosine similarity.
"""

from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger(__name__)


def _normalize_rows(arr: np.ndarray) -> np.ndarray:
    """L2-нормализация по строкам. На нулевую строку — нулевой выход."""
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return arr / norms


def cluster_embeddings(
    embeddings: np.ndarray,
    min_cluster_size: int = 8,
    min_samples: int = 4,
) -> np.ndarray:
    """Кластеризует векторы. Robust pipeline:

      1. HDBSCAN с **cosine**-метрикой (на 1536-мерных нормализованных
         эмбеддингах cosine стабильнее, чем euclidean — euclidean страдает
         от проклятия размерности и часто кладёт всё в шум).
      2. Если кластеров не нашлось — HDBSCAN с пониженным min_cluster_size
         (max(3, size // 2)).
      3. Если опять 0 — k-means c k = max(3, min(15, n // 30)) как
         «гарантированный» fallback. K-means всегда вернёт кластеры —
         даже если они «мягкие», LLM-naming извлечёт из них смыслы.

    Args:
        embeddings: shape (N, D). Если N < min_cluster_size — возвращает массив -1.
        min_cluster_size: минимальный размер кластера на первом проходе.
        min_samples: насколько «плотным» должен быть кластер.

    Returns:
        labels: shape (N,) — индексы кластеров (-1 для шумовых точек).
    """
    if embeddings is None or len(embeddings) == 0:
        return np.array([], dtype=int)

    arr = np.asarray(embeddings, dtype=np.float64)
    n = arr.shape[0]
    if n < min_cluster_size:
        return np.full(n, -1, dtype=int)

    # импорт внутри функции: hdbscan тяжёлый, не нужен при каждом импорте модуля
    import hdbscan

    # Нормализуем под cosine. HDBSCAN с metric='cosine' через precomputed
    # distance был бы тяжёлым (N×N), поэтому идём по углу через
    # нормализацию + Euclidean (для L2-норм векторов |u-v|² = 2(1-cos(u,v))).
    normalized = _normalize_rows(arr)

    def _hdbscan(min_size: int) -> np.ndarray:
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_size,
            min_samples=min(min_samples, max(2, min_size // 2)),
            metric="euclidean",
            cluster_selection_method="eom",
        )
        return clusterer.fit_predict(normalized)

    labels = _hdbscan(min_cluster_size)
    n_clusters = len({int(l) for l in labels if l >= 0})
    logger.info(
        "cluster_embeddings: HDBSCAN pass-1 n=%d min_size=%d → %d clusters, %d noise",
        n, min_cluster_size, n_clusters, int(np.sum(labels < 0)),
    )
    if n_clusters > 0:
        return labels

    # Pass 2: пониженный min_cluster_size
    fallback_size = max(3, min_cluster_size // 2)
    if fallback_size < min_cluster_size:
        labels = _hdbscan(fallback_size)
        n_clusters = len({int(l) for l in labels if l >= 0})
        logger.info(
            "cluster_embeddings: HDBSCAN pass-2 min_size=%d → %d clusters, %d noise",
            fallback_size, n_clusters, int(np.sum(labels < 0)),
        )
        if n_clusters > 0:
            return labels

    # Pass 3: k-means как гарантированный fallback. Даже «мягкие» границы
    # — это лучше чем «AI ничего не нашёл, 70% вечно». LLM-naming извлечёт
    # из каждого k-means кластера осмысленный pain-label.
    try:
        from sklearn.cluster import KMeans
    except ImportError:
        logger.warning("cluster_embeddings: sklearn недоступен, fallback на k-means пропущен")
        return labels

    k = max(3, min(15, n // 30))
    try:
        km = KMeans(n_clusters=k, n_init=4, random_state=42)
        labels = km.fit_predict(normalized)
        logger.info(
            "cluster_embeddings: KMeans fallback k=%d → %d кластеров (всё в кластеры, шума нет)",
            k, k,
        )
    except Exception as e:
        logger.warning("cluster_embeddings: KMeans fallback упал: %s", e)
        return np.full(n, -1, dtype=int)

    return labels


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
