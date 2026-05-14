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

    const webhookUrl = section.dataset.webhookUrl || '';
    const successUrl = section.dataset.successUrl || '/pages/thank-you';
    const productTitle = section.dataset.productTitle || '';
    const productId = section.dataset.productId || '';

    let currentVariantId = section.dataset.defaultVariantId;
    let currentQuantity = 1;
    let currentPrice = 0;
    let currentCompareAt = 0;
    let currentBundleLabel = '';

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
      const labelEl = input.closest('label')?.querySelector('.quraan-buybox__bundle-label');
      currentBundleLabel = labelEl ? labelEl.textContent.trim() : '';
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
        throw new Error('Request failed (' + res.status + '): ' + txt);
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.indexOf('application/json') !== -1) return res.json();
      return res.text();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(null);

      const fd = new FormData(form);
      const citySelect = form.querySelector('#quraan-city');
      const cityOption = citySelect && citySelect.selectedOptions[0];
      const data = {
        name: fd.get('name'),
        phone: fd.get('phone'),
        city: fd.get('city'),
        cityId: cityOption ? cityOption.value : '',
        cityName: cityOption ? (cityOption.dataset.cityName || cityOption.textContent.trim()) : '',
        cityRouteId: cityOption ? (cityOption.dataset.routeId || '') : '',
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

      if (!webhookUrl) {
        setError('لم يتم إعداد رابط استلام الطلبات. يُرجى التواصل مع المتجر.');
        console.error('[quraan-buybox] webhookUrl is empty. Set it in the section settings.');
        return;
      }

      const upsells = [];
      form.querySelectorAll('.quraan-buybox__upsell-check:checked').forEach((input) => {
        upsells.push({
          variant_id: parseInt(input.dataset.variantId, 10) || null,
          title: (input.closest('label')?.querySelector('.quraan-buybox__upsell-title')?.textContent || '').trim(),
        });
      });

      const idempotencyKey =
        (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) ||
        'qb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);

      const payload = {
        source: 'quraan-buybox',
        idempotency_key: idempotencyKey,
        order_id: idempotencyKey,
        submitted_at: new Date().toISOString(),
        customer: {
          name: data.name.trim(),
          phone: data.phone.trim(),
          city: data.cityName,
          city_id: data.cityId ? parseInt(data.cityId, 10) : null,
          city_name: data.cityName,
          route_id: data.cityRouteId ? parseInt(data.cityRouteId, 10) : null,
          address: data.address.trim(),
        },
        product: {
          id: productId,
          title: productTitle,
          variant_id: parseInt(currentVariantId, 10),
          bundle_label: currentBundleLabel,
          quantity: currentQuantity,
          unit_price: currentPrice / Math.max(currentQuantity, 1),
          total_price: currentPrice,
          compare_at_total: currentCompareAt,
          currency: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || '',
        },
        upsells: upsells,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
      };

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = '...';

      try {
        await postJSON(webhookUrl, payload);
        const successWithParams = successUrl + (successUrl.indexOf('?') === -1 ? '?' : '&') +
          'name=' + encodeURIComponent(payload.customer.name) +
          '&city=' + encodeURIComponent(payload.customer.city);
        window.location.href = successWithParams;
      } catch (apiErr) {
        console.error('[quraan-buybox] submit failed', apiErr);
        setError('حدث خطأ أثناء إرسال الطلب. الرجاء المحاولة مجدداً.');
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
