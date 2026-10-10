export function validatePrizeInput({
  prize,
  type = '',
  classify,
}) {
  const text =
    String(
      prize || ''
    ).trim();

  const explicitType =
    String(
      type || ''
    ).trim();

  const kind =
    classify(
      explicitType || text
    );

  if (
    !text
  ) {
    return 'O campo Premiação está vazio. Informe a premiação ou o link do registro.';
  }

  if (
    !kind ||
    kind === 'Não identificado'
  ) {
    return 'Não reconheci o tipo de premiação. Informe um tipo como Battlepass, VIP Evento, VIP Gente Boa ou Dinheiro. O registro não foi criado.';
  }

  const prizeTextWithoutLinks = text
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .trim();

  const kindFromPrize = prizeTextWithoutLinks
    ? classify(prizeTextWithoutLinks)
    : null;

  if (
    explicitType &&
    kindFromPrize &&
    kindFromPrize !== 'Não identificado' &&
    kindFromPrize !== kind
  ) {
    return (
      'O campo Tipo e o campo Premiação indicam categorias diferentes. ' +
      'Tipo informado: ' + kind + '. ' +
      'Premiação identificada: ' + kindFromPrize + '. ' +
      'Corrija os campos para indicar a mesma categoria. O registro não foi criado.'
    );
  }

  const clean =
    [
      explicitType,
      text,
    ]
      .join('\n')
      .normalize('NFKC')
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /https?:\/\/\S+/gi,
        ''
      )
      .replace(
        /<[^>]+>/g,
        ''
      )
      .replace(
        /[*_`~]/g,
        ' '
      )
      .toLowerCase();

  const aliases =
    /\b(?:battle\s*pass|better\s*paste)\b/g;

  const prizeOnly =
    text
      .normalize('NFKC')
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .toLowerCase()
      .replace(
        /https?:\/\/\S+/gi,
        ''
      )
      .replace(
        /[*_`~]/g,
        ' '
      );

  const source =
    aliases.test(
      prizeOnly
    )
      ? prizeOnly
      : clean;

  const expression =
    /(?:([+-]?\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s*(?:x\s*)?)?\b(?:battle\s*pass|better\s*paste)\b(?:\s*(?:x\s*)?([+-]?\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b)?/g;

  const matches =
    [
      ...source.matchAll(
        expression
      ),
    ];

  if (
    !matches.length
  ) {
    return null;
  }

  const quantity =
    value => {
      if (
        !value ||
        value === 'um' ||
        value === 'uma'
      ) {
        return 1;
      }

      if (
        value === 'dois' ||
        value === 'duas'
      ) {
        return 2;
      }

      const words = {
        tres: 3,
        quatro: 4,
        cinco: 5,
        seis: 6,
        sete: 7,
        oito: 8,
        nove: 9,
        dez: 10,
      };

      return words[value] ??
        Number(
          String(value).replace(',', '.')
        );
    };

  if (
    matches.some(
      match =>
        match[1] &&
        match[2] &&
        quantity(
          match[1]
        ) !==
          quantity(
            match[2]
          )
    )
  ) {
    return 'Quantidade de Battlepass contraditória. Use somente: 1 Battlepass.';
  }

  const count =
    matches.reduce(
      (
        sum,
        match
      ) =>
        sum +
        quantity(
          match[1] ||
          match[2]
        ),
      0
    );

  if (
    count !== 1
  ) {
    return (
      'Formato inválido: este registro aceita exatamente 1 Battlepass. Quantidade encontrada: ' +
      count +
      '. Use: 1 Battlepass. O registro não foi criado.'
    );
  }

  return null;
}