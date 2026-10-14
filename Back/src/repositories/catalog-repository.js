function createCatalogRepository(database) {
  return {
    async listCategories() {
      const result = await database.query(`
        SELECT c.id_categoria AS id, c.nome,
          COALESCE(
            jsonb_agg(
              jsonb_build_object('id', s.id_subcategoria, 'nome', s.nome)
              ORDER BY lower(s.nome), s.id_subcategoria
            ) FILTER (WHERE s.id_subcategoria IS NOT NULL),
            '[]'::jsonb
          ) AS subcategorias
        FROM public.categorias c
        LEFT JOIN public.subcategorias s ON s.id_categoria = c.id_categoria
        GROUP BY c.id_categoria, c.nome
        ORDER BY lower(c.nome), c.id_categoria
      `);
      return result.rows;
    },

    async listEstablishments({ busca, categoriaId, limite, deslocamento }) {
      // ESCAPE '!' trata os caracteres de LIKE digitados pelo usuário como texto.
      const pattern = busca ? `%${busca.replace(/[!%_]/g, '!$&')}%` : null;
      const result = await database.query(`
        WITH filtrados AS (
          SELECT e.id_estabelecimento AS id, e.nome, e.endereco, e.cep,
            e.cidade, e.estado,
            e.latitude::double precision AS latitude,
            e.longitude::double precision AS longitude,
            e.horario_funcionamento, e.telefone, NULL::text AS site, e.descricao
          FROM public.estabelecimentos e
          WHERE e.ativo = TRUE
            AND (
              $1::text IS NULL
              OR e.nome ILIKE $1 ESCAPE '!'
              OR e.descricao ILIKE $1 ESCAPE '!'
              OR EXISTS (
                SELECT 1
                FROM public.estabelecimento_subcategoria es
                JOIN public.subcategorias s ON s.id_subcategoria = es.id_subcategoria
                JOIN public.categorias c ON c.id_categoria = s.id_categoria
                WHERE es.id_estabelecimento = e.id_estabelecimento
                  AND (s.nome ILIKE $1 ESCAPE '!' OR c.nome ILIKE $1 ESCAPE '!')
              )
            )
            AND (
              $2::integer IS NULL
              OR EXISTS (
                SELECT 1
                FROM public.estabelecimento_subcategoria es
                JOIN public.subcategorias s ON s.id_subcategoria = es.id_subcategoria
                WHERE es.id_estabelecimento = e.id_estabelecimento AND s.id_categoria = $2::integer
              )
            )
        ), pagina AS (
          SELECT * FROM filtrados
          ORDER BY lower(nome), id
          LIMIT $3::integer OFFSET $4::bigint
        )
        SELECT
          (SELECT COUNT(*) FROM filtrados) AS total,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', p.id, 'nome', p.nome, 'endereco', p.endereco, 'cep', p.cep,
                'cidade', p.cidade, 'estado', p.estado,
                'latitude', p.latitude, 'longitude', p.longitude,
                'horario_funcionamento', p.horario_funcionamento,
                'telefone', p.telefone, 'site', p.site, 'descricao', p.descricao,
                'categorias', categorias.dados,
                'nota_media', avaliacoes.nota_media,
                'total_avaliacoes', avaliacoes.total_avaliacoes
              ) ORDER BY lower(p.nome), p.id
            ),
            '[]'::jsonb
          ) AS dados
        FROM pagina p
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object('id', agrupadas.id, 'nome', agrupadas.nome,
                'subcategorias', agrupadas.subcategorias)
              ORDER BY lower(agrupadas.nome), agrupadas.id
            ), '[]'::jsonb
          ) AS dados
          FROM (
            SELECT c.id_categoria AS id, c.nome,
              jsonb_agg(
                jsonb_build_object('id', s.id_subcategoria, 'nome', s.nome)
                ORDER BY lower(s.nome), s.id_subcategoria
              ) AS subcategorias
            FROM public.estabelecimento_subcategoria es
            JOIN public.subcategorias s ON s.id_subcategoria = es.id_subcategoria
            JOIN public.categorias c ON c.id_categoria = s.id_categoria
            WHERE es.id_estabelecimento = p.id
            GROUP BY c.id_categoria, c.nome
          ) agrupadas
        ) categorias ON TRUE
        LEFT JOIN LATERAL (
          SELECT AVG(a.nota)::double precision AS nota_media,
            COUNT(*) AS total_avaliacoes
          FROM public.avaliacoes a
          WHERE a.id_estabelecimento = p.id
        ) avaliacoes ON TRUE
      `, [pattern, categoriaId, limite, deslocamento]);

      const row = result.rows[0];
      return {
        dados: row.dados,
        paginacao: { limite, deslocamento, total: Number(row.total) },
      };
    },
  };
}

module.exports = { createCatalogRepository };
