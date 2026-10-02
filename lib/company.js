// Company details printed on every document (footer) and shown in the live preview.
const NAME = 'PT. Balla Sultana Samata';
const ADDRESS = 'Jl. Paraikatte, Romang Polong, Kec. Somba Opu, Kab. Gowa, Sulawesi Selatan';
const PHONE = '0877-8575-8656';

module.exports = {
  NAME, ADDRESS, PHONE,
  footerText: `${NAME}  •  ${ADDRESS}  •  Telp/WA ${PHONE}`,
};
