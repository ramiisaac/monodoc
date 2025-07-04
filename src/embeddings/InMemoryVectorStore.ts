import { EmbeddedNode, RelatedSymbol } from "../types";
import { logger } from "../utils/logger";

/**
 * Computes the cosine similarity between two vectors.
 * Cosine similarity measures the cosine of the angle between two non-zero vectors.
 * It is a measure of similarity between two vectors of an inner product space.
 * @param vec1 The first vector.
 * @param vec2 The second vector.
 * @returns The cosine similarity score, or 0 if vectors are empty or have mismatched lengths.
 */
function computeCosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length === 0 || vec2.length === 0 || vec1.length !== vec2.length) {
    logger.debug(
      `Cosine similarity input error: vector length mismatch or empty. vec1.length=${vec1.length}, vec2.length=${vec2.length}`,
    );
    return 0;
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  // Calculate dot product and magnitudes
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i]; // sum of squares
    magnitude2 += vec2[i] * vec2[i]; // sum of squares
  }

  // Calculate square roots of magnitudes
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  // Avoid division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * An in-memory vector store for storing and querying embedded nodes.
 * It supports adding nodes and finding semantically related symbols using cosine similarity.
 */
export class InMemoryVectorStore {
  private embeddedNodes: EmbeddedNode[] = [];

  /**
   * Adds an array of embedded nodes to the vector store.
   * @param nodes The array of EmbeddedNode objects to add.
   */
  addNodes(nodes: EmbeddedNode[]): void {
    if (!nodes || nodes.length === 0) {
      logger.debug("Attempted to add empty list of nodes to vector store.");
      return;
    }
    this.embeddedNodes.push(...nodes);
    logger.debug(
      `Added ${nodes.length} nodes to vector store. Total: ${this.embeddedNodes.length}`,
    );
  }

  /**
   * Finds semantically related symbols to a query embedding within the store.
   * Filters by a minimum similarity score and limits the number of results.
   * Excludes the node itself from results.
   * @param queryEmbedding The embedding vector for which to find related symbols.
   * @param minScore The minimum cosine similarity score to consider a symbol related.
   * @param maxResults The maximum number of related symbols to return.
   * @param excludeNodeId Optional. The ID of the node to exclude from the results (typically the query node itself).
   * @returns An array of RelatedSymbol objects, sorted by `relationshipScore` in descending order.
   */
  findRelatedSymbols(
    queryEmbedding: number[],
    minScore: number,
    maxResults: number,
    excludeNodeId?: string,
  ): RelatedSymbol[] {
    const relationships: RelatedSymbol[] = [];

    // Basic validation for query embedding and store content
    if (
      !queryEmbedding ||
      queryEmbedding.length === 0 ||
      this.embeddedNodes.length === 0
    ) {
      logger.trace(
        "Skipping related symbol search: query embedding is empty or no nodes in store.",
      );
      return relationships;
    }

    for (const node of this.embeddedNodes) {
      // Skip the node itself if an exclude ID is provided
      if (node.id === excludeNodeId) {
        continue;
      }

      // Ensure the node has a valid embedding
      if (!node.embedding || node.embedding.length === 0) {
        logger.debug(
          `Skipping node ${node.id} for similarity search: its embedding is empty.`,
        );
        continue;
      }

      // Compute similarity and add to results if score meets threshold
      const score = computeCosineSimilarity(queryEmbedding, node.embedding);
      if (score >= minScore) {
        relationships.push({
          id: node.id,
          name: node.nodeName,
          kind: node.nodeKind,
          filePath: node.filePath,
          relativeFilePath: node.relativeFilePath, // Relative path is useful for display
          relationshipScore: score,
        });
      }
    }

    // Sort results by score in descending order
    relationships.sort((a, b) => b.relationshipScore - a.relationshipScore);

    // Return a sliced array if maxResults is specified
    return maxResults > 0 ? relationships.slice(0, maxResults) : relationships;
  }
}
