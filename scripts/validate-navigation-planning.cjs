/*
 * Verificação de UI em Chromium, com respostas sintéticas isoladas.
 * Requer export web apontando EXPO_PUBLIC_API_URL=http://127.0.0.1:28000,
 * shared compilado e playwright + @axe-core/playwright no NODE_PATH.
 * Não substitui testes de integração HTTP/PostgreSQL nem ensaio em aparelho.
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { default: AxeBuilder } = require("@axe-core/playwright");

async function main() {
  const {
    navigationGraphSchema,
    findNavigationRoute,
    navigationAnchorRequestSchema,
  } = await import("shared");
  const root = path.resolve(__dirname, "../unifacens-client/dist");
  const bundleRoot = path.join(root, "_expo/static/js/web");
  const bundles = await fs.readdir(bundleRoot);
  const isolated = await Promise.all(
    bundles
      .filter((file) => file.endsWith(".js"))
      .map(async (file) =>
        (await fs.readFile(path.join(bundleRoot, file), "utf8")).includes(
          "http://127.0.0.1:28000",
        ),
      ),
  );
  assert.ok(
    isolated.some(Boolean),
    "Exporte o web com EXPO_PUBLIC_API_URL=http://127.0.0.1:28000 e --clear antes de testar.",
  );
  const output = path.resolve(__dirname, "../docs/evidencias/planejamento-ar");
  await fs.mkdir(output, { recursive: true });
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  const anchors = Array.from({ length: 20 }, (_, index) => ({
    id: "10000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
    name:
      ["Entrada fictícia", "Bifurcação fictícia", "Jardim fictício"][index] ??
      "Outro local fictício " + (index + 1),
    description:
      index === 2
        ? "Ao lado da biblioteca"
        : "Referência sintética " + (index + 1),
    cloudAnchorId: "synthetic-" + index,
    createdAt: now,
    category: null,
    latitude: null,
    longitude: null,
  }));
  const baseEdge = {
    id: "stairs",
    fromNodeId: "origin",
    toNodeId: "access",
    kind: "stairs",
    lengthMeters: 20,
    stepCount: 8,
    widthMeters: 1.2,
    longitudinalSlopePercent: 0,
    crossSlopePercent: 0,
    hasHandrail: true,
    hasTactilePaving: true,
    surface: "firm_regular",
    verification: {
      status: "verified",
      verifiedAt: now,
      validUntil: future,
      evidenceIds: ["synthetic-only"],
    },
    availability: { status: "open", checkedAt: now, validUntil: future },
  };
  const graph = navigationGraphSchema.parse({
    id: "demo-visual",
    version: "v1",
    dataSource: "demo",
    nodes: [
      {
        id: "origin",
        name: "Origem da rede",
        kind: "gate",
        anchorId: anchors[0].id,
      },
      {
        id: "junction",
        name: "Referência da rede",
        kind: "junction",
        anchorId: anchors[1].id,
      },
      {
        id: "access",
        name: "Destino da rede",
        kind: "reference",
        anchorId: anchors[2].id,
      },
    ],
    edges: [
      baseEdge,
      {
        ...baseEdge,
        id: "walk",
        toNodeId: "junction",
        kind: "walkway",
        lengthMeters: 40,
        stepCount: 0,
      },
      {
        ...baseEdge,
        id: "ramp",
        fromNodeId: "junction",
        kind: "ramp",
        lengthMeters: 30,
        stepCount: 0,
        longitudinalSlopePercent: 5,
      },
    ],
  });
  const summary = {
    networkId: graph.id,
    version: graph.version,
    dataSource: "demo",
    status: "published",
    nodeCount: 3,
    edgeCount: 3,
    createdAt: now,
    publishedAt: now,
    retiredAt: null,
  };
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (pathname === "/") pathname = "/index.html";
      else if (!path.extname(pathname)) pathname += ".html";
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const types = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
      };
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const results = [];
  let diagnosticPage;
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    diagnosticPage = page;
    page.on("requestfailed", (request) =>
      console.log(
        "request failed",
        new URL(request.url()).pathname,
        request.failure()?.errorText,
      ),
    );
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let scenario = "ok";
    let listMode = "empty";
    let anchorsMode = "ok";
    let delayRoute;
    let routeSeen;
    let requestCount = 0;
    await page.route("http://127.0.0.1:28000/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (pathname === "/auth/get-session")
        return json({
          user: {
            id: "visual-user",
            name: "Pessoa de teste",
            email: "visual@example.org",
            role: "user",
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          },
          session: {
            id: "visual-session",
            userId: "visual-user",
            token: "synthetic-session",
            expiresAt: future,
            createdAt: now,
            updatedAt: now,
          },
        });
      if (pathname === "/auth/token")
        return json({ token: "synthetic-visual-token" });
      if (pathname === "/anchors") {
        if (anchorsMode === "error")
          return json({ message: "synthetic failure" }, 503);
        return json(anchorsMode === "empty" ? [] : anchors);
      }
      if (pathname === "/navigation/networks") {
        if (listMode === "error")
          return json({ message: "synthetic failure" }, 503);
        return json({
          items: listMode === "empty" ? [] : [summary],
          nextOffset: null,
        });
      }
      if (pathname.endsWith("/route-by-anchors")) {
        requestCount++;
        const input = navigationAnchorRequestSchema.parse(
          route.request().postDataJSON(),
        );
        assert.equal(input.mode, "demonstration");
        routeSeen?.();
        if (delayRoute) await delayRoute;
        if (scenario === "error")
          return json({ message: "synthetic failure" }, 503);
        const evaluated = structuredClone(graph);
        if (scenario === "insufficient")
          evaluated.edges.forEach((edge) => {
            edge.verification = { status: "unverified" };
          });
        if (scenario === "closed")
          evaluated.edges.forEach((edge) => {
            edge.availability = { status: "closed" };
          });
        const ids = [
          ...new Set([input.origin.anchorId, input.destination.anchorId]),
        ];
        const byAnchor = new Map(
          evaluated.nodes.map((node) => [node.anchorId, node.id]),
        );
        const unmappedAnchorIds = ids.filter((id) => !byAnchor.has(id));
        if (unmappedAnchorIds.length)
          return json({
            status: "anchor_not_in_network",
            graphId: graph.id,
            graphVersion: graph.version,
            dataSource: graph.dataSource,
            needs: input.needs,
            unmappedAnchorIds,
          });
        return json(
          findNavigationRoute(
            evaluated,
            {
              originNodeId: byAnchor.get(input.origin.anchorId),
              destinationNodeId: byAnchor.get(input.destination.anchorId),
              mode: input.mode,
              needs: input.needs,
            },
            new Date().toISOString(),
          ),
        );
      }
      if (
        pathname ===
        `/navigation/networks/${graph.id}/versions/${graph.version}`
      )
        return json({ ...summary, graph });
      throw new Error(`Requisição inesperada na validação: ${pathname}`);
    });
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${baseURL}/planejar`);
    await page.getByRole("heading", { name: "Planejar percurso" }).waitFor();
    const area = page.getByRole("radio", { name: /Demonstração/ });
    await page
      .getByText("Ainda não há percursos publicados", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Ponto de partida: Selecionar ponto" })
      .click();
    await page.getByRole("radio", { name: /Entrada fictícia/ }).click();
    await page
      .getByRole("button", { name: "Ponto de chegada: Selecionar ponto" })
      .click();
    await page
      .getByRole("textbox", { name: "Buscar em ponto de chegada" })
      .fill("BIBLIOTECA");
    await page
      .getByRole("radio", { name: "Jardim fictício", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, "busca-por-referencia.png"),
    });
    await page.getByRole("radio", { name: /Jardim fictício/ }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Calcular percurso", exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({ path: path.join(output, "pontos-sem-rede.png") });
    results.push(
      "Vinte pontos AR disponíveis sem rede publicada; destino encontrado pela descrição sem depender de categoria ou coordenadas.",
    );
    listMode = "ok";
    await page.getByRole("button", { name: "Atualizar áreas" }).click();
    await area.click();
    const calculate = page.getByRole("button", { name: "Simular percurso" });
    await calculate.click();
    await page.getByText("20 m", { exact: true }).waitFor();
    await page.getByText("Chegada: Jardim fictício", { exact: true }).waitFor();
    results.push("Sem restrição: 20 m pela escada.");
    const stepFree = page.getByRole("checkbox", {
      name: "Evitar degraus e escadas",
    });
    await stepFree.click();
    assert.equal(
      await page.getByRole("heading", { name: "Prévia do percurso" }).count(),
      0,
    );
    await calculate.click();
    await page.getByText("70 m", { exact: true }).waitFor();
    results.push(
      "Sem degraus: 70 m por calçada e rampa; prévia antiga retirada ao editar.",
    );
    await page
      .getByRole("button", { name: "Ajustar largura e inclinações" })
      .click();
    const width = page.getByRole("textbox", {
      name: "Largura mínima livre (m)",
      exact: true,
    });
    await width.fill("1,20");
    await calculate.click();
    await page.getByText("70 m", { exact: true }).waitFor();
    const beforeInvalid = requestCount;
    await width.fill("abc");
    await calculate.click();
    await page
      .getByText("Informe um número, usando ponto ou vírgula decimal.", {
        exact: true,
      })
      .waitFor();
    assert.equal(requestCount, beforeInvalid);
    await width.fill("");
    results.push(
      "Vírgula decimal aceita; texto inválido bloqueado antes de chamar a API.",
    );
    scenario = "insufficient";
    await calculate.click();
    await page
      .getByRole("heading", { name: "Faltam dados para recomendar um caminho" })
      .waitFor();
    scenario = "closed";
    await calculate.click();
    await page
      .getByRole("heading", { name: "Nenhum caminho compatível" })
      .waitFor();
    scenario = "error";
    await calculate.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Não foi possível consultar" })
      .waitFor();
    scenario = "ok";
    await calculate.click();
    await page.getByText("70 m", { exact: true }).waitFor();
    results.push(
      "Dados insuficientes, sem rota e falha HTTP com recuperação e escolhas preservadas.",
    );

    // Alterar A → B → A durante a consulta não pode restaurar a resposta descartada.
    let release;
    delayRoute = new Promise((resolve) => {
      release = resolve;
    });
    const seen = new Promise((resolve) => {
      routeSeen = resolve;
    });
    await calculate.click();
    await seen;
    await stepFree.click();
    await stepFree.click();
    const oldResponse = page.waitForResponse((response) =>
      response.url().endsWith("/route-by-anchors"),
    );
    release();
    await oldResponse;
    await calculate.waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("[role=button]")].some((el) =>
          el.textContent.includes("Calculando percurso"),
        ),
    );
    assert.equal(
      await page.getByRole("heading", { name: "Prévia do percurso" }).count(),
      0,
    );
    delayRoute = null;
    routeSeen = null;
    await calculate.click();
    await page.getByText("70 m", { exact: true }).waitFor();
    results.push(
      "Resposta atrasada descartada mesmo ao retornar às escolhas anteriores.",
    );

    await page
      .getByRole("button", { name: "Ponto de chegada: Jardim fictício" })
      .click();
    await page
      .getByRole("textbox", { name: "Buscar em ponto de chegada" })
      .fill("Outro local fictício 20");
    await page
      .getByRole("radio", { name: "Outro local fictício 20", exact: true })
      .click();
    await calculate.click();
    await page
      .getByRole("heading", {
        name: "Ponto AR encontrado, percurso ainda indisponível",
      })
      .waitFor();
    await page
      .getByRole("heading", {
        name: "Ponto AR encontrado, percurso ainda indisponível",
      })
      .evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: path.join(output, "ponto-sem-vinculo.png") });
    results.push(
      "Ponto AR sem vínculo continua selecionável; cálculo explica a ausência de percurso.",
    );
    await page
      .getByRole("button", {
        name: "Ponto de chegada: Outro local fictício 20",
      })
      .click();
    await page
      .getByRole("radio", { name: "Jardim fictício", exact: true })
      .click();
    await calculate.click();
    await page.getByText("70 m", { exact: true }).waitFor();

    for (const viewport of [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await page
        .getByRole("heading", { name: "Planejar percurso" })
        .scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.width && (rect.left < -1 || rect.right > innerWidth + 1)
            );
          })
          .map((el) => el.tagName),
      );
      assert.deepEqual(overflow, [], `Overflow em ${viewport.width}px`);
      const tooSmall = await page.getByRole("button").evaluateAll((elements) =>
        elements
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width && (rect.width < 44 || rect.height < 44);
          })
          .map((el) => el.textContent),
      );
      assert.deepEqual(tooSmall, [], "Alvo de toque menor que 44px");
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      assert.deepEqual(
        audit.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => node.target),
        })),
        [],
      );
      await page.screenshot({
        path: path.join(output, `formulario-${viewport.width}.png`),
      });
      await page
        .getByRole("heading", { name: "Prévia do percurso" })
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.screenshot({
        path: path.join(output, `previa-${viewport.width}.png`),
      });
      results.push(
        `${viewport.width}px: sem overflow, botões >=44px, axe sem violações WCAG A/AA detectadas.`,
      );
    }
    await page
      .getByRole("button", { name: "Ponto de partida: Entrada fictícia" })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("textbox", { name: "Buscar em ponto de partida" })
      .fill("Bifurcação");
    await page.getByRole("radio", { name: /Bifurcação fictícia/ }).focus();
    await page.keyboard.press("Space");
    assert.equal(
      await page
        .getByRole("button", { name: "Ponto de partida: Bifurcação fictícia" })
        .getAttribute("aria-expanded"),
      "false",
    );
    results.push("Seletor operável por teclado (Enter, busca, foco e Espaço).");
    assert.equal(
      await page
        .getByRole("button", { name: "Ponto de partida: Bifurcação fictícia" })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await stepFree.focus();
    const checkedBefore = await stepFree.isChecked();
    await page.keyboard.press("Space");
    assert.notEqual(await stepFree.isChecked(), checkedBefore);
    const focus = await stepFree.evaluate((element) => {
      const style = getComputedStyle(element.closest("label"));
      const bounds = element.closest("label").getBoundingClientRect();
      return {
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
        targetWidth: bounds.width,
        targetHeight: bounds.height,
      };
    });
    assert.notEqual(focus.outline, "none");
    assert.ok(
      focus.width >= 2 && focus.targetWidth >= 44 && focus.targetHeight >= 44,
    );
    results.push(
      "Critério alternado por Espaço com foco visível e rótulo clicável >=44px.",
    );
    listMode = "empty";
    await page.getByRole("button", { name: "Atualizar áreas" }).click();
    await page
      .getByText("Ainda não há percursos publicados", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Ponto de chegada: Jardim fictício" })
      .click();
    await page
      .getByRole("textbox", { name: "Buscar em ponto de chegada" })
      .fill("biblioteca");
    await page
      .getByRole("radio", { name: "Jardim fictício", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "sem-percursos.png"),
      fullPage: true,
    });
    results.push(
      "Lista vazia oferece mensagem de percursos ainda não publicados.",
    );
    listMode = "error";
    await page.getByRole("button", { name: "Atualizar áreas" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Não foi possível consultar" })
      .waitFor();
    listMode = "ok";
    await page.getByRole("button", { name: "Atualizar áreas" }).click();
    await area.waitFor();
    results.push("Falha ao listar áreas permite nova tentativa.");
    anchorsMode = "error";
    await page.getByRole("button", { name: "Atualizar pontos AR" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Não foi possível carregar os pontos AR" })
      .waitFor();
    anchorsMode = "empty";
    await page.getByRole("button", { name: "Atualizar pontos AR" }).click();
    await page
      .getByText("Nenhum ponto AR cadastrado", { exact: true })
      .waitFor();
    anchorsMode = "ok";
    await page.getByRole("button", { name: "Atualizar pontos AR" }).click();
    await page
      .getByRole("button", { name: "Ponto de partida: Selecionar ponto" })
      .waitFor();
    results.push(
      "Falha e lista vazia de âncoras permitem recuperação sem confundir com ausência de rede.",
    );
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(output, "resultado.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          environment:
            "Chromium headless; respostas sintéticas; sem GPS/AR/aparelho físico",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(results.join("\n"));
  } catch (error) {
    if (diagnosticPage) {
      console.log(
        (await diagnosticPage.locator("body").innerText()).slice(0, 4000),
      );
      await diagnosticPage.screenshot({
        path: path.join(output, "erro.png"),
        fullPage: true,
      });
    }
    throw error;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
