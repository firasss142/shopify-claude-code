(function () {
  'use strict';

  function init(section) {
    const form = section.querySelector('#quraan-buybox-form');
    const bundleInputs = section.querySelectorAll('input[name="quraan_bundle"]');
    const thumbs = section.querySelectorAll('.quraan-buybox__thumb');
    const mainImage = section.querySelector('#quraan-main-image .quraan-buybox__image');
    const submitBtn = form ? form.querySelector('.quraan-buybox__submit') : null;
    const errorEl = form ? form.querySelector('[data-buybox-error]') : null;
    const subtotalEl = section.querySelector('[data-buybox-subtotal]');
    const discountEl = section.querySelector('[data-buybox-discount]');
    const discountRow = section.querySelector('[data-buybox-discount-row]');
    const totalEl = section.querySelector('[data-buybox-total]');

    let currentVariantId = section.dataset.defaultVariantId;
    let currentQuantity = 1;
    let currentPrice = 0;
    let currentCompareAt = 0;

    // ---- Gallery thumbs ----
    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        thumbs.forEach((t) => t.classList.remove('is-active'));
        thumb.classList.add('is-active');
        if (mainImage && thumb.dataset.imageSrc) {
          mainImage.src = thumb.dataset.imageSrc;
          mainImage.alt = thumb.dataset.imageAlt || mainImage.alt;
        }
      });
    });

    // ---- Bundle radios ----
    function formatMoney(cents) {
      // Shopify cents; we use Intl with whatever currency Shopify's window.Shopify offers
      const currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'LYD';
      try {
        return new Intl.NumberFormat('ar-LY', {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
        }).format(cents / 100);
      } catch (e) {
        return (cents / 100).toFixed(2);
      }
    }

    function updateSummary() {
      const subtotal = currentCompareAt > currentPrice ? currentCompareAt : currentPrice;
      const discount = currentCompareAt > currentPrice ? currentCompareAt - currentPrice : 0;
      const total = currentPrice;

      if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
      if (totalEl) totalEl.textContent = formatMoney(total);
      if (discountEl && discountRow) {
        if (discount > 0) {
          discountEl.textContent = '-' + formatMoney(discount);
          discountRow.removeAttribute('hidden');
        } else {
          discountRow.setAttribute('hidden', '');
        }
      }
    }

    function syncBundle(input) {
      if (!input || input.disabled) return;
      currentVariantId = input.value;
      currentQuantity = parseInt(input.dataset.quantity, 10) || 1;
      currentPrice = parseInt(input.dataset.price, 10) || 0;
      currentCompareAt = parseInt(input.dataset.compareAt, 10) || 0;
      updateSummary();
    }

    bundleInputs.forEach((input) => {
      input.addEventListener('change', () => syncBundle(input));
      if (input.checked) syncBundle(input);
    });

    // ---- Form submit ----
    if (!form) return;

    function setError(message) {
      if (!errorEl) return;
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function validate(data) {
      if (!data.name || !data.name.trim()) return 'الرجاء إدخال الاسم الكامل.';
      const phoneDigits = (data.phone || '').replace(/\D/g, '');
      if (phoneDigits.length < 8) return 'رقم الهاتف غير صالح (8 أرقام على الأقل).';
      if (!data.city) return 'الرجاء اختيار المدينة.';
      if (!data.address || !data.address.trim()) return 'الرجاء إدخال العنوان التفصيلي.';
      return null;
    }

    async function postJSON(url, body) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Cart API error: ' + res.status + ' ' + txt);
      }
      return res.json();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(null);

      const fd = new FormData(form);
      const data = {
        name: fd.get('name'),
        phone: fd.get('phone'),
        city: fd.get('city'),
        area: fd.get('area'),
        address: fd.get('address'),
      };

      const err = validate(data);
      if (err) {
        setError(err);
        return;
      }

      if (!currentVariantId || currentVariantId === '' || currentVariantId === '0') {
        setError('لم يتم ربط منتج بهذه الصفحة. يُرجى التواصل مع المتجر.');
        console.error('[quraan-buybox] No variant id available. Section may be missing a product setting, or the section is on a non-product page.');
        return;
      }

      const upsellInputs = form.querySelectorAll('.quraan-buybox__upsell-check:checked');
      const items = [
        {
          id: parseInt(currentVariantId, 10),
          quantity: currentQuantity,
          properties: {
            'المدينة': data.city,
            'المنطقة': data.area || '',
            'العنوان': data.address,
          },
        },
      ];
      upsellInputs.forEach((input) => {
        const vid = parseInt(input.dataset.variantId, 10);
        if (vid) items.push({ id: vid, quantity: 1 });
      });

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = '...';

      try {
        await postJSON('/cart/clear.js', {});
        await postJSON('/cart/add.js', { items });
        await postJSON('/cart/update.js', {
          attributes: {
            'الاسم': data.name,
            'الهاتف': data.phone,
          },
          note: 'الاسم: ' + data.name + '\nالهاتف: ' + data.phone + '\nالمدينة: ' + data.city + '\nالمنطقة: ' + (data.area || '-') + '\nالعنوان: ' + data.address,
        });
        window.location.href = '/checkout';
      } catch (apiErr) {
        console.error(apiErr);
        setError('حدث خطأ أثناء معالجة الطلب. الرجاء المحاولة مجدداً.');
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  function boot() {
    document.querySelectorAll('.quraan-buybox').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
