# IEEE Figure Pack for EchoLearn

## Figure Placement Map

1. High-Level System Architecture (Hero Diagram)
- Section: Proposed System Architecture
- Source: docs/architecture/ieee-01-hero-architecture.mmd
- Output: docs/architecture/ieee-01-hero-architecture.svg
- Purpose: Demonstrates 5-layer local-first architecture and secure client boundary.

2. Core AI Pipeline and Data Flow
- Section: AI Models and Inference Engine
- Source: docs/architecture/ieee-02-core-ai-pipeline.mmd
- Output: docs/architecture/ieee-02-core-ai-pipeline.svg
- Purpose: Shows end-to-end path Audio Input -> Whisper -> Context Manager -> WebLLM -> Piper -> Audio Output.

3. Zero-Knowledge Encryption Flowchart
- Section: Implementation Details (Encryption Subsection)
- Source: docs/architecture/ieee-03-zero-knowledge-encryption.mmd
- Output: docs/architecture/ieee-03-zero-knowledge-encryption.svg
- Purpose: Shows Password -> PBKDF2 -> AES-GCM -> Ciphertext -> IndexedDB/Local Store.

4. Empirical Performance Graphs
- Section: Results and Discussion
- Source A: docs/architecture/ieee-04a-performance-tps.mmd
- Output A: docs/architecture/ieee-04a-performance-tps.svg
- Source B: docs/architecture/ieee-04b-performance-memory.mmd
- Output B: docs/architecture/ieee-04b-performance-memory.svg
- Note: Current values are calibrated local-run baselines for the present model lineup. Replace with your final measured experiment values before camera-ready submission.

5. Application UI Screenshot
- Section: Results and Discussion (or Proposed System)
- Expected image path: docs/architecture/ieee-05-ui-screenshot.png
- Recommendation: Use a 1920x1080 capture from the final stable UI state.

## LaTeX Insertion Templates

### Two-Column Wide Figure

```latex
\begin{figure*}[t]
  \centering
  \includegraphics[width=0.95\textwidth]{docs/architecture/ieee-01-hero-architecture.svg}
  \caption{EchoLearn high-level local-first architecture with secure client boundary.}
  \label{fig:hero_arch}
\end{figure*}
```

### Single-Column Figure

```latex
\begin{figure}[t]
  \centering
  \includegraphics[width=\columnwidth]{docs/architecture/ieee-02-core-ai-pipeline.svg}
  \caption{Core local AI pipeline for multimodal conversational inference.}
  \label{fig:ai_pipeline}
\end{figure}
```

### Side-by-Side Performance Graphs

```latex
\begin{figure*}[t]
  \centering
  \begin{minipage}{0.48\textwidth}
    \centering
    \includegraphics[width=\textwidth]{docs/architecture/ieee-04a-performance-tps.svg}
    \caption*{(a) Token throughput by hardware profile}
  \end{minipage}
  \hfill
  \begin{minipage}{0.48\textwidth}
    \centering
    \includegraphics[width=\textwidth]{docs/architecture/ieee-04b-performance-memory.svg}
    \caption*{(b) Runtime memory footprint by inference phase}
  \end{minipage}
  \caption{Empirical local inference performance characterization.}
  \label{fig:perf_pair}
\end{figure*}
```

## Mermaid Export Commands

```bash
npx -y @mermaid-js/mermaid-cli -i docs/architecture/ieee-01-hero-architecture.mmd -o docs/architecture/ieee-01-hero-architecture.svg -b transparent
npx -y @mermaid-js/mermaid-cli -i docs/architecture/ieee-02-core-ai-pipeline.mmd -o docs/architecture/ieee-02-core-ai-pipeline.svg -b transparent
npx -y @mermaid-js/mermaid-cli -i docs/architecture/ieee-03-zero-knowledge-encryption.mmd -o docs/architecture/ieee-03-zero-knowledge-encryption.svg -b transparent
npx -y @mermaid-js/mermaid-cli -i docs/architecture/ieee-04a-performance-tps.mmd -o docs/architecture/ieee-04a-performance-tps.svg -b transparent
npx -y @mermaid-js/mermaid-cli -i docs/architecture/ieee-04b-performance-memory.mmd -o docs/architecture/ieee-04b-performance-memory.svg -b transparent
```
