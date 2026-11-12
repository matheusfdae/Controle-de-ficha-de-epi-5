-- Apaga os lançamentos fictícios criados por subir.sql e relatorio.sql.
DELETE FROM movimentacoes_diarias WHERE codigo LIKE 'DEMO-%';
