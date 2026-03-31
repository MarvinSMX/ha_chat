/* HA Chat FAB (HACS Frontend resource)
 * Lovelace Custom Card: FAB + Popup, Chat per fetch gegen den echten Ingress-Pfad.
 *
 * /hassio/ingress/<name>/api/* liefert von Lovelace oft HTML/405. Der Pfad
 * /api/hassio_ingress/<token>/api/* (von „Expose Add-on Ingress Path“) wird
 * von HA korrekt an das Add-on durchgereicht.
 *
 * Card type: custom:ha-chat-fab
 * Config:
 *   addon_slug: "2954ddb4_ha_chat"
 *   icon, zIndex
 *   title: Popup-Header + FAB-Tooltip (Standard: HA Chat)
 *   welcome_title, welcome_subtitle: Empty-State (optional)
 *   area_scope: optionaler Raum/Bereich (HA Area Name/ID) für N8N/MCP-Filter
 *   system_prompt: optionaler FAB-spezifischer Prompt (überschreibt Add-on-Default)
 *   welcome_image_url: optional eigenes Bild statt eingebettetem Willkommens-Emoji (PNG)
 *   ha_bearer_token: optional Long-Lived Token (wie curl -H "Authorization: Bearer …")
 *   addon_direct_url: optional http(s)://host:PORT – umgeht HA-Ingress (wie Zircon3D-Workaround)
 */

(() => {
  const OVERLAY_CLASS = 'ha-chat-fab-overlay';
  const BACKDROP_CLASS = 'ha-chat-fab-backdrop';
  const STYLE_ID = 'ha-chat-fab-styles';
  const POPUP_CLASS = 'ha-chat-fab-popup';
  const PROMPT_SUGGESTIONS = [
    'Was kann ich dich fragen?',
    'Welche Lichter sind gerade an?',
    'Zeig mir den Status der Heizung',
    'Welche Geräte sind aktiv?',
  ];

  const fetchOpts = { credentials: 'same-origin' };
  let WEB_WAKEWORD_LOADED = false;
  let WEB_WAKEWORD_LOADING = null;

  function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** HACS stellt meist nur ha-chat-fab.js aus – alte YAML/Caches mit /hacsfiles/.../hand.png liefern 404. */
  function isUnavailableHacsHandAssetUrl(src) {
    if (typeof src !== 'string' || !src.trim()) return false;
    return /\/hacsfiles\/[^?#]*hand\.png(\?|#|$)/i.test(src.trim());
  }

  const WELCOME_HAND_PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAMAAAC8EZcfAAAC/VBMVEUAAADLfwzBcgq9awtvb29paWloaGh1dXVfX19cXFxmZmZhYWFhYWFhYWFwcHBzc3NoaGh2dnZwcHB4eHhkZGR3d3dkZGRua2pvb29xcXFsbGtvb29wcHBxcXFxcXFycnKzYAjDcAq8Zgi8agrAcAq7bQm5ZQi6ZQm7aQi7awrAbwrMgA/bjxLBcQm/bQm/bQi+awjAbwi9awrAcAi8agi1Ygi8agjBcQrMfRC+bQu8aAjhmBHelhXsqiPnoh7ppSHrqyjspyXknRjhmBDZjhLViAzWiBLNfgzNfgrOgBDAbwjPhxnQkBfakhPdkBDQgRHYiBDViA/ShxXdlhXVihHWihPbkBPZjw/elBXglhLbkRTelRPhnhrckxPgmBfimhXmoBrurSnqpyPurSrrrzDrqSRtbW1sbGxwcHBoaGhkZGRfX19YWFjtsCDoqBzopRToqBPnpBDkoA/inAzhmAnglAjekATdjALYiAPQgADIeADIcATAaAW4aAq0YQq4YAjgkRLRiAjgkAjgkAHXgQDQeAHAdA/IeAnQiBDgmBjooCDosCHwsCTwqCD8yET4yED8zEj8yUj/zEj/zUb/zkj/z0T/zEL/yzz/yTj+yDf9xjT8xDP5wDDwuCjwsCDoqBjgoA/YkAjgmBDooBjYmBrgoCjgmCDQhxfYkBjQgBDIgA3AcAbQgAjYkBDgoBjoqCDwsCjxuDD4wDj8yD78xDj4wTL4vC30uCj4wCz4vCjwuCD4wCjUhALgoCDoqCjwsDDwuDj4wD/4yEf4xEDxwEHywDj1vDP1vCjzuCTwtCDwuCTwtCXyuCrvsBzssBvsrBnprRjooBDwqBj4uCj4uDH4wEn5yE/8zlD8zEz/yEj4xjj8yDj5xDD/yDT8yDT8xDD7wjD/1Fr70Fn/01f/0Fj/1Fj/1Fz/1GD/2GT/12b/12f/1mT/2GD/0VL/0FT/0FD/0Ez/0Ej/zET/zED/yz//yj7/yDz/yDj/yED/0ED/yDD/0E3/z0z/z0r/1F6AUs0jAAAAZnRSTlMACIyXo/7uM+1BsH+bj84i3Ri1EMJFzwiIWE9rgGCSeIs44EDUMNUgvBilEJ/gSOhS8Gj4c+/IKPKxYO5hdWU747+C+G94gcHX5oDz/lj2Yv6QyiCs4kDuTOIw1CjEGLb27pbS/auBhT5PAAAidElEQVR4AczBxRHEAAwEsD0IM3N9HkP/7zQRsIR7TUcD1wYbI3iWq8Yb/IpiFdF/B68yU2HmvoJTVa/MRFxHcGqalYmIwwFeLSHTSYxZcCeOR1F8jHF3d3d3dzem7t5Av8H6sdoOmQaqpMwcWMdD3Sjj7k5HvgIaju97CRa6vpnO/yj+475373tJfoFk8LTP8/PpyanS/n9jlLFEfn6+RPI5CPdk52Ttzcnbnf6X7xo3niPs+yqv2J9lt8Kx5+5L7N+LKsq4E5AQqjykj/myLVYHHsZqz8qOFXFU0QwBIfbh2L5Nm2yz3UFWVCgUJGO1dGWkCvNlaFHR8HERwolISIzuy8ROLO3qJi9RFOW2kbTVYk5JFoy4IrlcPjbSdeNGE/mFBcSgvuPrn9aZe4N0u5Vut8f2FgjLBISjAFAmGzorIunYgkIgnNF3Bj6NgDYlAvqAsF5jSkuNjj+cwjL5zMheIwHC/E9jlP7S5NRYm54xduZ2O2ygIBD6nUBoLk1Lj46/yTDlCPns8BNziELQ8BO0YequfXv37t23f4/g2UPG0i4rAgJhFRA2PtfoSldG/40Jw2VIODX8xHgklMwWO0x2YdjZLZaurrxoxMNnS812hnRTKhUAVtucUGTdL4eFUSMjJARUWdiG4ua1NM/SzUDUQZJYzHt39Y+U2GDsLLc6ApRK6a6qqvY7e27WXyxNOCX49GyOMGyM6eIXeUWG2eogFW9IkqHrLWZzJI9X/1bCSVhBYRN6qp1O+pnmslZgZUgbQiIhJGHNBiEhMVNEwP1llm6HggIIMOqNek1ZRogwfRVIeNHqULgR0Ov3O9VYZOOFFYIvGA+EsvAEGccVWUQnS5PK7DdIhVtFgUg2EPGiLuzU5cUlpYhvA8AqL9QYu/ByqVHYhuMmg1Fkw0MPZ6GEIsb1qdIyO3PN5lapMO78mCVXMoISrS02GE1meFlR5fEg4Ht1CxBqExKFy9ZgbMM5YUULgFA8nxzmARWUEhCBkKGBIJgl/ZcWl3zb2WVlbF6vN1DN1tap6VttGp02RSr4jllyIISqhuIaAceLBqgFQAdIqARCVaWH5YywPyihvvgsFBkIQcBq1gmAKOET4wVhqA/CNhwfeSSmhIeMnfZuBtuMAkBXpYdLux07g134hcFYarY8ZwJeHwJ++Eg334U/YDwkbMOxICExI1xyjBqxJDxzFsbFTexCilIqlS6PH636JCmee3XLquISrg0bAv4atrZB/ZFuab5Trottw2mYNWPHhbJRTAkXbTV2WjhCCgMZjMLS7W2Pn6Twa8H2DcUlWpPZyjj9NcjXSNNNHGGatFfWEDPDEopo5P5HvtOakbDBFgQMsDRaNRiHA/RQZGxDZy14RA2AQKh5qvv2XG8nDw6F4SA0slhZuLEYaoiEJPgEZ1qA5fI4aOUV277gCJ83NjQAoPrjx49IePnK6Z3CkYcSTg3hopHhkShnyxqYF0DIMJjHkNZ+1vmhHcNkP//6QiA0gVFodR0Q4unh0jBJMPLGCCTELCwYK9JEHvhFCdaQJ/R4vWxtrZpu1zx4coDXaO06zigWGgjhvK8DwiaUOG1FrIThtWYaZ5NZItlkTTFGyX1sQ5/P5wdAKDJWMYG38nE9GgUIG9UsdzCvsQ0P95IwJNqE0XAB9WdhLY3fuWv/rt17pP+4C/W/8W0IhIEAAIIdPrQ0hxeX/svhDVqTpp5Ws35/IICE6CPT6cSYtCbkoXsLU/F+kvwPbLIiMXtfprmr3J7LLcj/5IAP9L8iIWroZ5HvXR1UEQOZ3xuWLOStDHntgROAN32ANtSVYhaFzyRcrseHbYKPZvbKjESgAy2e0zSsyHCtLf1nRV6s/1WLhE2NDcgHeYJVvAeE/ExbsE7PGQVGHtrIw7LqnnZNecwFwEQZIRsasslwvK05OeYyPjkjs8xitzIOkoQFmYEbFjmJ/4QQfKDHLvseCZEPjrqHvnU3ZGXoAs4ouBu6KDcYvY7v0l8ORn3LDGSaE34Ap2iE4Gd2JsFQ6naQV9+8qXhju+ZgbkKhU/8R4fZNX5TwGtIYyHye0K1IuDvYhvxuSCooFRdF8AcwitBHkVsNKFpoPI8cOXLUyGmCveRbWNBvOK6+ef369aVLFVevMTet9q596f/MKF/+TqlZxbW1bWt8y9OVt2v2tL3u7u7b3f3t3PvMuQrHsLZAKsAlBLNQnLoZlCMbrtaopRbDstYiNElL0t/5vjHXbKlA6Dhnu/0Z+o0xV/o7JDx4gM2EfCRkO1z8iUpDFEomLyEOSlsAigv/L/Nz/e9nWOm0UefHu0hjLBC53WY3LW97WzsBq6SZJbdN/5reUF6hCGGgvIZSOErdIKU8TaWhLACQr4jxfieVl3vKCF34Mxii+lRbQ74O8MUvwkDYBhe2/FBVvWacM/lFuAiEW0F4nYDRaCQWvc6hJ/JU0rDyOPcXmdeFiPHhIygj90MP/M2fwEY5b735Vubx7FOnL5lxwwZEjE+3nKiqfHO8290kuEhHmXwo2LtsJ9n/JyuATkMcQ+hBVPoNCTLTMLl98WEDpPnpSxbwtAPbTnecrKr8cNz9euIEEiofeqIR8O3cCcIDWFLeHZGGSKMYq8QDwMMkZLNMah/IP9nWbRqCdyEPfO2nT52o3vLumOfn5cuWvrlc97L584TQ1dzl9JAPO4BlRZ1OtJO1qhuCkOp1bwSAhUXXnYcO/wTCVHTDJPbmOw0SYGMYfKQDXvuZUyer3JtfG8Pt333/w8mTzd/qkcOGzYmBmUbdsFMMhEddJYvfVGkoI6cFhBGJ8X70SqQhlFeSBH/vHXaAtrhhoMOAjoBnOlpOuGtfHOOnWnHyVAfbOQ4eq1SUXplelybSCoD0XwK/3MUapZuNnYYkJCAID8mW92GSNJyBBsAMNIx4dx7YYOA79UN1zYL5z41my5pQ9DTcZLZVfP6RllZpLJRW3hp2JhIJM2GJwq4Q3TBxniJ0cmaTkHkIwmRpOKWeq1lbNx2o+E53oAced+8Z3YHLvzmBjpHL42mr7HHL9ExjGra0tuc64rDETpRyEZWBLCEvTbeHcmsUdu2ex1NEQgzlMRvExvqGLETYMC7SgXBeB/lOwIGjZ+AUNgx13o3QRXrqbtI7SE6uGY9bOykOohhrTeVyklkEF+o0pIEShCUVqWO125dqsfdIhJGAKF7gke/4ljEc+NWn7BeyrTvCMe7C2NalGF8UH6Eht+VachgcCudLoagl5QWqV0nDWPguDP7lqt+IJB3V3qzXgOzO7cKHi7e7dgwHfsK2JCcZuXhcIcHqVbphk5AjwwE+LAHhiEd+AjabyROkGzbjp7Msw7Kwpop65TlkNFvz87TMbacYYTgQfMDram6qrkmf9NyotqZcAe4gIAijEPH2xWPiQk24NwwD3+6wSkNZUl6bqnoNUgpmQjlgILJQkAKj2Nqfp2S6zrV1X0SEc9qFrzMbDpz9yhgXj9QKCdPgDjkoDObLcXL1GhkZuBlJKTOM4IOGtiU048hKr62E8mozvL6QYeIWcc35O6Rh5qgzYW19SiNc3m2KxkJ8u4rFgROeG8ODDY2ulgNCCEC5kbNSFOFrrwrhSbTDiOIrKLxyg4SibJiGyJAzF27dVIQqyKWZS0YFLCNgriN3ew77S1dXJzJwz29mjQE4LaO8BPL0MjQ8bDchPPpqxIbNZrOt2dl6JcYdBICF+5wkZKZhhwHhiVPnb93y+0IAjIl/S0aVDeuQMgB0OLbn0IFdtgOnThxrXd+YUrqtuWs/CXfv3i1uEh9yqDGM0F5ZJMQmyqYMEz81QtlglwchOu+FW16/12CdSDfkEvV0qVrfUNHcGhuM7W1v7QBfS2dzU2btb9BjxrCF9eUlrs6z+/ehEnYz08ABAj3U5szew6mMmbFX88Wi6JfZjWg24Ec/z0KQQ17E2IEslMsmd/mnShkFGMNj0H7wIcLZxxHhaWOf3dJTSqGszu6PxoZYCEN3NCEvb0w0ISx27rP5whbHMghXKdmwx91EQknCsFqi/osHnadIhQ1sg9gIo/ugLsCHd8njNemvjq2BJr+KxNgG7Ye5CkQAgvDK/gNSCaJPNeGNIuBBvlqmEDZ9s4Z/FcKGaXjh4rBpcRhx1eciuuop6bQghX16L65SuC4CsFgi/EISCTQL3a7CBcL9VyKR/DtDQ3eGcDbiXYjKQToyr6uuYix6is/wGkLIQhLZ0IhemWea1k648FqRHCMqVi97MlhwhetcTgy1hMPYwa5ipKC79jcznktimBipNmG0ID8Sy8+PoJuoWv2M7XCezAy5eMTC4Av5UBEglDR9aSoIOc/zzASmJQWsE4T/iz7w9BTMCStAOFCazPSJyQABoAmRZ9FIfkG0oKBAPdawHKlfZaQUO6Mxy4QDfX4/fehqpP6bMRtpiMi15xJQdoCrjDL6wOMRTsvkJB58CIgaSV84josHTi7odiC8sQ9ZViBmV4oIvFdeVoTnTscsg3z3A/1G7J4zu/zD+dQ9v1FBzoWsDYuCvc6B+X8gfKzJSJsWwEMSYdbInOeS20uaEHscDgroxtiVUGu637GdcO7yX2+E4L9AIOA3Ys7ikob33n/u+YXKhTlwoYg23nScZ488dnydtiCDDmx7ANjZ6WrKrGGTSW6vKEL7niDFupsCFZXQKLN/Fm7oyHAqgxAd6Pf7vRaDXLZ+Pg6LaNdwb54DomY3UgxG7QXCdyc/cMKGtIasZu5zDg24NTsrM2Pm/HHetf4lTRMWoVgjqFZLEWZOmSz61X6vu+C9CToCShqWlr33Gd/yqhljh0lAzkRN+Mv3PvlKmtnbG+rlB7zQbVoa8B+zK1JrX1U/QvIov4wlRO3COJ9i8A6apk3IpsuDA5UBtMvFW8TzoZKNGCBKGz5ct34PAFuRhKbJmxctogj/7xcfv/fu2jmb1teqo1jbRWMEYFOFuzZ5jYixEP5F5+G9GAJsmYmEg8O1uaT8Xbluau1y0euDYXKg1zBLyxu2ZLiP8z25G8uBciLj7MHNCU78RVlafX1aQyVTuO2irXoA+HsANnLdHK9Nm0ofSi3vDUPAJkzkfEyJ/LWyyXFdByHSkAJw2ByOgxCITceP45wBB8aHYYqQwger3lkilpaXZ8r7QduFW6EQAgN25++KFSDmyLgJketY5DrP4b1r0NqJiYZNKqIFrGiXWhxWTsGHIQN8cZiFZiNXXFwLcuOmArQUYNTjue4kYnZTdjbwEN9btynLBvkP/e4giriR++a4Dc0EhE2ug1zXHQDcuQu+UOLrrbdFHf6m1o271hmUIlgICHewaC/n5MQc8WHDBhxkiKEtPEVFQAQkTtE5lwyv1+v3hwyLccE5p3grcnDP+D3IXRKEjZxpp0koXS2sCd+0Rb6bpdyGyRtXZmmLmwYBmYSDQ5jo+QUFhR6eQEF4AyOI/QnmM4y79ijZmo0i4RPG+G3WzHSZGGqN2kFA7UM+a7IdCiHmmqX44DGDZtKnMBBjBdSA6ojs8URjg6YB992/D8CHZexCm+FCN34DgXoqASEvqLAHPhQdv2m2NBuMDWgDRYiSgRFS8XGFFs1mA6Lzo61aZsgXoAFQdWomISbJQq0Gn/ExB5uc3gGGtID9DO1QLUrNHFkJwWPkaKxrxteSZzQFWIAQg7Awmh+2DC/o+gAYMti9bqBKign4KsTMMxLWa0K1DsOgD9XdiOv8Q0LUiKFH830hNIkXvkNjiOlCWKGKcCDY19cX8N02rJGAC1567hntBZvQyW1YISLKqDt88zZf9KvkKSdbHHElXzDYF2BykY/hpQ3Rg0JIQKjIQKC3B38fteTdiALcij6TvuiZX7aFkLXMR0UA5oMQhXeVhO9DPr6uGnYHRLTi6+ntUYCoD80XgaxUhB5EWEok2NvT0xPADGcj5GMz9GCSPpOcMBJDwHA2cqj7Zfn6ryAsXkbDzqKy6TZCfn9/kP/dgJ9DTPgiMK0qScgSYYT7enp7AeiTRqgAIWcwjJ+dUB22tpLwSuQOImwhehZXOTm8TIM6FGWTB78EyNfTz+Q3xYERzabN7jFB8PUGWSXmA0UoVTJ5/GAjXyKEEO//EaUcUK4kLEkloWroLZjKXn8fAyeOMSwH8vVxPkiju5KBwV4aXG33mQMKcIuc3pLbV8u+W7nyx1WfEFKki0S5E4QxWeSMkOi/IyUNlIdoRtjXKb0CPbQgU4unhcf48qP5EUpLgyUiFuznsMOrxn7xIKfxjPHwLfu+BdaMD8qWiccn2oQ8o293mCaaMfrD3XtOV0UZ5CE2wYzMbGzDANR8w4yw3Vw0YIz1wgz0wYEIMarJBizC2V0B1m5Kjjf5R3x01MpPG/k91pvqNedf7CjzBmz4bvtu3w4JYWPKi5Ofmz9zj5vrujgGfARUcn8kXzQffHRgCIDkQzoEWcZUwgCUPlMzKXnuge809EhOjnzz9taqyQ8JcUZHOwkRcCBkQF0ddTU2rJ8xfyoAedYK9IGPE1ZqOBx5xIH5AEQHYInQ0yMB2QgBiBNEzfqkw27piRYEkt9xx0DoKi3/4H21LpOQc7fbe9vnu+0dAAT6g6uksmYjbpeQrt5b9zFFZM6ZCUb4TnREeUSkYase0y+ADLMAohHSg+wzWzZMThbg77PxuIo7uv7aCMepz0SgqlXvlKxyvoEQAKlE0G0QGDgw54LXL0Y+ylsA6iIh3hD5hgYJ6AegHeKAAEZtwKZM98Zkr4iffcOPkHcPitmHfoxdLvRY9bK2If7Q0AA0KALZsZ3NTdD4ORcM382bsp5wP3E4OIXz2aKjaC4RwUOPZw37pUbEg0HqGXrQebi4U1XJK0kAP5HnjqHdg8IYUYQ8asgJWAjPgzBEwAQJY9HWFryfWPQr/jSFVlwcSKYYJgn/T+M9jw70Ydz0arM7NYfxTwJY82YyQH5oQmWwmxbGRnNWPv+US75swyfPgNAYMOJmgoSwS5cuGWyOAwMUqyKsHXL91EY8GoakCBmVgnQjhyJHCQC5eTam1qxJFuKPcZJwXo5AGMTCOH/ySE3CN7mGkBCFcuZ8WzdAuIeYwybQYJDQhl6eUMKIMIYiuIgWVnRYr1HDIUZYmwBaAiibJ8r43aRvpA0VvKBGbItqH/InmzaCMA5AGLhk7xSzd6cEvwEHlZBpOIZElYh0Qe1BDXgYISYgvnZIYmvrU4XwypXCKKyAbw1HcftpWCvLqBCe5JOYGTdN4RtQq/vAgPmAD4CQ30ImrqTx8SUhTcYGZJw5ShwKUJ1n3B8kPRBuTCkvAeHVoivcINBn0eiPFmer248QZtmECTqQxcHewgxUgNj/+FpGRBuN5gCgZdopqB0ogJZSC7+XTu1+L2mn3lRfVkpCIP6nfEfBnZtX6lQoAyybXIflU6E8i4B6gfQKIPl28ptIIBKQZLQdNPKFOIjFhLFfOrUA/gQPljS630squCauV4RngQhAMXVhlaEyTb3KYWOXp1kCcoH0o3lLCVt8hwQioQY1Go2AbDIQ+w8Bg48A8vzx4VfJrx4z68tw9XCdPXToRpEYFgmPnGVwocRJQS79J/gtvUkP+u9zwKFJh0iYACCwEFCB2oWHSW0JDagJFaBcpQ4U24CbPxvXLgfC/+cp33njxnUs2/yc556zGISfMcrc5Y6T8BLbn73HkVCa9C6GWNh2aDpljPBjgP0CKEVCwH9qrHw64F/8/Z/9+V//w8Nd7l/qU8orEObDh5z7QeiJ4pmacxdjj5fy6ZqQ4surAG/e5BTmsilg/J8yK2FZ8B0/dVCA4NMWfDQHAZi55alPe3//sz/Scg4Bcm9LHI4zmZhzbdvaP9v7zVXHtjPJsz2v5yYPsdUTbUeRlsPYtr9fVZ8+0/+gn27F/lJ16hTPpPr3t5XsUIdAuAPCtWtkZwB/75nBUoU9EZbSBdROiRkNMcB9BignMToDC22b64o7SUBicfDiv2UB533rToAlfVJI55jTMPMaPQdXqV1bkVltGjyt/6kRfoNjCiHOvIk+W06DiNn4elZvoIkuiPgc8FBLwNCdqaghFttNfedY15c1xLgo6V2N0ZM/K99WrbUyAP/w+9OnsoTf/law8k/UwDy538/gfgeECpuebsmWBJQbx3TL+1uVNbW1AwYMBLBFrCvpfv8DccuP7dJ2LX6tzZuBMKM1Wq60HOGPvtC61WtPiBAVnla5Lg3iJbKxwAKdGkiIX99ZQGpnyALfgWw+KEDXYAwlD/QpKkrlVnI7Fmn/tW9LX35z5pSpENbuKmukJSUd/ibo8DvKHBiI2N6Ld9IOyMT75CYeo3Pi6jud0+ANK9oDoIqmCw3UxUGDEfBBPXJMFYcf3qf3KX16306YTleUNboO1fpo0Ljk24S9x8kcNtIKP2WhBEAFvOPEE6AiICJACWrMAlp5zyUoC/v4AMDqageMsY538sj98fWH9u4TPdZFIlwnQs3tALQ1hp9SKn2Pt0MC/OU1qdAVuBdCclYk0klk9KDBZvnUUZ1DWiQC1IIIgLXV6Szgi9ExtHfdLyjtYX9pluhTW9hL6xw2sB0qPbLQs5ti7stt2gC4fMUlJcn8s3zai+yD8DgFgSTymQ5leM32IKT1dkx3E+U1Fq7HiaXAJCBb4mz/f/Jo/CGE/XrmEb4cCG1FtMFWHC9zppfRppg/a94m2nI2kkX41xAKPgBNdBojInwhtcDKokNQoAIdZXGN+JYCqGAcn3vYC49wuXSXkdu3S8ztjHBnetf6jHIHH4tZubf0X3p5dYksGUIq5SB8NwcYdKg40iI5M0av/05ne0cGuD0ByG49gB+2iy8cwwuaKJRKCsxu5qa/1jNlJ3ahRAYitDUvUQAq6T8eAc3OyIkIKB8WoHVhnRA856PsYTFXfFh40JJoYn8+LRWan0RPTj2cP3l+bhyEO3QhVvh9w0xCdxdyia6r8vhTACYJAYTO+SRyFCekRGjWeM/52A2RAtMDtm7dJsC50Yv9VSiSe+FYYg9vi/rmp9hGyIWog+gqJJL99vIlltzOwOeA8HH4gqV136iOCv6BkOZYgIHQK9STasJqzkggrqpOb922bVv5IMo6AUZpl2/k7v0g/DTx7uh5GoROKGemSa9jaAko1Rt8FBon94kPre3NAao+zvLpBJJD/JYUEUYhSrKLIQ2NGZ3Ardu2l5ezPDxvbixK3DHMyA/Gjy4hwqJI6KkDyY2CCjlsnRwZRBOlfL+TUmRgyqZIKMCTARBBfdpWQxyRst/52CfFhaXA8vJBQ4fNWZysO+83I0ed9e0gwoSVGdlAqOSGY9hAm9UF8+pfk2s2B9d1b+GAeURBlN7QTNK6nwlzNeCQM1yprAsoV602vkFD50yeNTeZbj1iRu7WPXcsnfD+28Zio0NQ0Qz+glOeEZ/7JUqTMD726zAeQmWqqkRz9TudM0SjeO3+r19bZXyuwFlzQ8Ka8OReJTkdFkF427uZD16dGXXoQQVGCMN0SQ0vRLDNglTegBJP5Up5n0lcCPrnVSj+0ZSh3sTA26U/FLh47lcSw6ZwXROFE4TFKDU/qHjqsKusSTFFZb0AOYCh7abWcPiBIooAIUSRKlTOGh9/Sl8k2vuHzw8gfA74pVYuyWPoIS96CmbucX9iXYXUYY4REvYQ3YnWkLxxQxmroIzPCflh7IigQgC9o+nvoxo0ms2URb4hQ4cOH7F47tzkRDYEFF7xPxzNXqxEh1ysY15QeceCys/Tu6j26hqd8Iz10xi7KbhKnFai2xhIUXIIfSoBnL+caayrK2PrXyEOvsHgDR0mwK/daVpX0s4I20eNlTyU+lSERV1b2vl7z4lQtRSBWYbmyuEQ7lNTnNwuKVlTe8yQ02bXfAxvdVkmk6msqkZ/zocC54z8drimk4S9nBAdBunbT1VKCsS8K1v1qB3ENRSkIqQrbpWaKqBDh1AlcuwYXw4FRiXaqJCoYS9ihNe0Gro1FWvh25LlGzZseMLCCVf+5OMP8wlLOhelAOzfr6Tlld3Wr+ztKpkzqxv/Wn9Bw18HVA6KHFK+fPToYXAx9g0h2nA2AOIa0l5FZZX48F+O32fGN3vW3PeSZXuMca7DB1v+XLvkGzNVe9QBZuaatZlMmVfMaqnlegVRwMwSosKw8QifrFtJy7cmxwcdfCNnz1pw9zEJyaB0mJ/zdyzun3zP1fotZdkirHVCqZDuh/QXBTjrkct3ROgqVOQlNcC69FOrat2+4hOe+Oa/d48Wevduftvkfzi0Tg/Kwsmg4gdR+VdZ48ULl09aV/JIUiDEu2+4rzig330Z8VVHPuGNYCdp7gKmsQUJ2/cp9IZadYAO4hbyr0wdi5gaLUiHqC1PbDLrFSnDJ88NmogdWb50sK/wps2eMn/B648X+ihUiikfdniw4IbhuDGjp2JmCHUML/v8DaAEoh9DEXpyrzdZuIfxpcP50+mbNnL26PkLCm7Y9n7ECHkC3L3A/t5zC8eOmW2EGYx8KRC6I+cBHpKR/Z7REeQErnf9Rb6pI0eOGj160fzSl59tVUge7AAihB0e6l3guV0g3IWjaIoe20IJwmM0vmy6KEBToPENiPYdOQq+DfNn3nOLP97PRsir6vtL7knYFsLRw9UqFiF3DaUGhImbRsW5+XC4ZBTd3L7bAl/QX2m4YgqZuT3lPISpfvdEZAtTB9EIGxtUqARECJ0TvGM2PXa+Pxof6bMVIOiP4Bb0t2hRaekTbuDC8gDlMYCfpvp3KrDatdAJaS5ZKaXSBMRjTNIPZeVgnB7bFQMfBg7hV+7hfDNKSycUXAaISryvg+UyRQVchR4hB9EJG7T1HRCjRPv+0a5A+GoD37DItwC+wgvKeREkhRQXXCR9Jku4Xs2lP+LMQtwLI5C+e6tsK1RH8MlBtgS+Ec63YcyM0gkTtNr4HyIShQsI7z4jYWM9SgTxJGIrcJhWovVcLfU3+Q3o4WNH1N+GRTPhe592wn8onYo5goXk2fdxFQjXrWdeoYVhtAgjeszCeR6o6sPSUzt/g3EPXX/gSX8zF06Y+ByFyH8sve/lxPG6GW+Eug+bGg2RiQU73i6/uXxZxVsDKYzsu646jXnFF9zX+Z7BgT8vaf3Ymwtn2PjR6oDGK2JEkVm5dEF4jU2e3aM/z04V3cQ3/XPn03UzYeHYKRCuI+yVcRb/CqMVpeov1dc7Hu4LX777gjdj3Hjs+3nyITT8x4+dMnmJsuyKjEOiyb9eufJX3/v106f0NMd3qx0zyE0QiMLwEA7BdsQAqElDDNjoqWxDUgBgEoyr3gGpXbqX6gWqJqLeqO/xIGkPILjod4Iv//sfw8yC1jfYxNS/O9PTo7B6iN0fClBEx1/Q5QP0/uZHfkkyHLH7MxjGcKqsP9+z4+lQFLvt9qtm910UmB69DjWfP1xfn/x4G364zFhEDBEUTyDZgDcP+je4NuuB++F5VL/EZi2h2E4U4g8YKtac9kcky8pKrx4v9o/GKxLdYu1hqTF8b9J8vrqUZZkR5zNkd8Hh4tMG+qVVfH6I4zWfWZtokxgPPhcUV9frhYDowK7RIz9sXyQSB+vXKgMuos0SFW/gWDOHZyGwIz2KL6jaN3li7TPTMUTvw13n+e0FzIBXtCO9dNEsB8XXAdpUkGLqujkBcgBeLEkPlyOZ9llHSGMV5hwswXGRpi4B0aEdnGzV7grVllh3GLIjYnD0fd/z3sAMe4d22D1MT+cG6xaNqyIGxxCCbAgCmC3oOaZtsO4xZqYjUDLaEBCdgNnqvCexx0DRxrKpgiVS2TkTbg3YQyEZfcvmsixzbs/6hsQeEkmRRgrrgn9+AEUzQ1e0Xs3HAAAAAElFTkSuQmCC';

  function parseJsonResponse(r) {
    return r.text().then(function (text) {
      const raw = (text || '').replace(/^\uFEFF/, '').trim();
      let data;
      try {
        if (!raw) throw new Error('Leere Antwort');
        if (raw[0] !== '{' && raw[0] !== '[') throw new Error(raw.length < 120 ? raw : raw.slice(0, 100) + '…');
        data = JSON.parse(raw);
      } catch (e) {
        let msg = r.status ? 'HTTP ' + r.status : 'Kein gültiges JSON';
        if (e.message && e.message !== 'Leere Antwort') msg += ' – ' + e.message;
        throw new Error(msg);
      }
      if (!r.ok) throw new Error((data && (data.error || data.message)) || 'HTTP ' + r.status);
      return data;
    });
  }

  function processInline(text, apiPathPrefix) {
    const prefix = apiPathPrefix || '';
    let out = '';
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[img:"([^"]+)"\]|\[([^\]]*)\]\(([^)]+)\))/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, m.index));
      if (m[2] !== undefined) out += '<strong>' + escapeHtml(m[2]) + '</strong>';
      else if (m[3] !== undefined) out += '<em>' + escapeHtml(m[3]) + '</em>';
      else if (m[4] !== undefined) out += '<code>' + escapeHtml(m[4]) + '</code>';
      else if (m[5] !== undefined) {
        const proxySrc = prefix + '/api/proxy_image?url=' + encodeURIComponent(m[5]);
        out += '<span class="img-wrapper">'
          + '<span class="img-skeleton"></span>'
          + '<img class="chat-img" src="' + escapeAttr(proxySrc) + '" alt="Bild" loading="lazy">'
          + '</span>';
      } else {
        out += '<a href="' + escapeAttr(m[7]) + '" target="_blank" rel="noopener" class="badge content-link">' + escapeHtml(m[6]) + '</a>';
      }
      last = re.lastIndex;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function renderMarkdown(text, apiPathPrefix) {
    if (!text) return '';
    const lines = text.split('\n');
    let out = '';
    const listBuf = [];

    function flushList() {
      if (!listBuf.length) return;
      out += '<ul>';
      listBuf.forEach(function (li) { out += '<li>' + processInline(li, apiPathPrefix) + '</li>'; });
      out += '</ul>';
      listBuf.length = 0;
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const hm = line.match(/^(#{1,4})\s+(.*)/);
      if (hm) {
        flushList();
        const tag = 'h' + (hm[1].length + 2);
        out += '<' + tag + '>' + processInline(hm[2], apiPathPrefix) + '</' + tag + '>';
        i++;
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        flushList();
        out += '<hr>';
        i++;
        continue;
      }
      const lm = line.match(/^[\-\*]\s+(.*)/);
      if (lm) {
        listBuf.push(lm[1]);
        i++;
        continue;
      }
      flushList();
      if (line.trim() === '') {
        if (out.length && !out.endsWith('<br>')) out += '<br>';
        i++;
        continue;
      }
      out += processInline(line, apiPathPrefix) + '\n';
      i++;
    }
    flushList();
    return out;
  }

  function ensureStyles(root) {
    const r = root || document.head || document.documentElement;
    if (!r) return;
    const exists = r.querySelector ? r.querySelector('#' + STYLE_ID) : null;
    if (exists) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${OVERLAY_CLASS}{
        position:fixed;
        display:flex;
        align-items:center;
        justify-content:center;
        bottom:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-bottom, 0px));
        right:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-right, 0px));
      }
      .${OVERLAY_CLASS} button{
        width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;
        background:var(--ha-color-fill-primary-loud-resting, var(--primary-color, #03a9f4));
        color:var(--ha-color-on-primary-loud, #fff);
        box-shadow:var(--ha-box-shadow-m, 0 4px 12px rgba(0,0,0,.35));
        display:flex;align-items:center;justify-content:center;
        -webkit-tap-highlight-color:transparent;
      }
      .${OVERLAY_CLASS} button:hover{filter:brightness(0.95)}
      .${OVERLAY_CLASS} ha-icon{color:inherit}
      .${OVERLAY_CLASS} svg{width:22px;height:22px;display:block}

      .${BACKDROP_CLASS}{
        position:fixed;
        inset:0;
        display:none;
        background:rgba(0,0,0,0.32);
        pointer-events:auto;
        -webkit-tap-highlight-color:transparent;
      }
      .${BACKDROP_CLASS}[data-open="true"]{display:block;}

      .${POPUP_CLASS}{
        position:fixed;
        right:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-right, 0px));
        bottom:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-bottom, 0px));
        width:min(396px, calc(100vw - 24px));
        height:min(560px, calc(100vh - 112px));
        background:var(--card-background-color, rgba(25,25,25,0.98));
        color:var(--primary-text-color, #e1e1e1);
        border:1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius:24px;
        border-bottom-right-radius:10px;
        box-shadow:var(--ha-box-shadow-l, 0 10px 30px rgba(0,0,0,.45));
        overflow:hidden;
        display:none;
        flex-direction:column;
        z-index:100000;
        font-family:inherit;
      }
      .${POPUP_CLASS}[data-open="true"]{display:flex;}
      .${POPUP_CLASS} .head{
        height:48px;
        flex-shrink:0;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 8px 0 12px;
        background:var(--sidebar-menu-button-background-color, rgba(0,0,0,0.08));
      }
      .${POPUP_CLASS} .title{font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .${POPUP_CLASS} .head .btn{
        width:40px;height:40px;border:none;border-radius:9999px;background:transparent;
        color:var(--secondary-text-color, #9b9b9b);cursor:pointer;display:flex;align-items:center;justify-content:center;
      }
      .${POPUP_CLASS} .head .btn:hover{background:rgba(255,255,255,0.08);color:var(--primary-text-color,#fff);}
      .${POPUP_CLASS} .body{flex:1;min-height:0;display:flex;flex-direction:column;}
      .${POPUP_CLASS} .thread{flex:1;overflow-y:auto;min-height:0;padding:8px 10px;}
      .${POPUP_CLASS} .msg-col{display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:620px;margin:0 auto;}
      .${POPUP_CLASS} .msg{margin:2px 0;padding:9px 12px;border-radius:14px;max-width:92%;width:fit-content;line-height:1.5;font-size:0.9rem;}
      .${POPUP_CLASS} .msg.user{background:#009AC7;color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
      .${POPUP_CLASS} .msg.assistant{background:#2d2d2d;border:1px solid #3a3a3a;border-bottom-left-radius:4px;}
      .${POPUP_CLASS} .content{white-space:pre-wrap;word-break:break-word;}
      .${POPUP_CLASS} .content h3,.${POPUP_CLASS} .content h4,.${POPUP_CLASS} .content h5{margin:8px 0 4px;font-size:1em;}
      .${POPUP_CLASS} .content ul{margin:4px 0 4px 16px;padding:0;}
      .${POPUP_CLASS} .content code{background:#1a1a1a;color:#9cdcfe;border-radius:4px;padding:1px 4px;font-size:0.85em;}
      .${POPUP_CLASS} .content a.content-link{color:#fff;background:#009AC7;text-decoration:none;padding:1px 8px;border-radius:10px;font-size:0.82em;}
      .${POPUP_CLASS} .sources{margin-top:6px;font-size:0.8em;display:flex;flex-wrap:wrap;gap:4px;}
      .${POPUP_CLASS} .actions{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;}
      .${POPUP_CLASS} .actions button{padding:4px 10px;border-radius:8px;border:1px solid #3a3a3a;background:#2d2d2d;color:#ccc;font-size:0.8rem;cursor:pointer;}
      .${POPUP_CLASS} .actions button:hover{border-color:#009AC7;color:#009AC7;}
      .${POPUP_CLASS} .typing-indicator{display:inline-flex;gap:3px;}
      .${POPUP_CLASS} .typing-indicator span{width:5px;height:5px;border-radius:50%;background:#009AC7;animation:fab-blink .6s ease-in-out infinite both;}
      .${POPUP_CLASS} .typing-indicator span:nth-child(2){animation-delay:.1s;}
      .${POPUP_CLASS} .typing-indicator span:nth-child(3){animation-delay:.2s;}
      @keyframes fab-blink{0%,80%,100%{transform:scale(.6);opacity:.5}40%{transform:scale(1);opacity:1}}
      .${POPUP_CLASS} .img-wrapper{position:relative;display:inline-block;max-width:100%;margin:4px 0;border-radius:8px;overflow:hidden;}
      .${POPUP_CLASS} .img-skeleton{width:240px;height:140px;max-width:100%;border-radius:8px;background:linear-gradient(90deg,#1e2a30 25%,#263540 50%,#1e2a30 75%);background-size:200% 100%;animation:fab-skel 1.4s ease-in-out infinite;}
      @keyframes fab-skel{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .${POPUP_CLASS} .chat-img{display:block;max-width:100%;max-height:220px;border-radius:8px;object-fit:contain;opacity:0;transition:opacity .25s;}
      .${POPUP_CLASS} .img-wrapper.loaded .img-skeleton{display:none;}
      .${POPUP_CLASS} .img-wrapper.loaded .chat-img{opacity:1;}
      .${POPUP_CLASS} .composer{flex-shrink:0;padding:8px 10px 10px;display:flex;justify-content:center;}
      .${POPUP_CLASS} .composer-shell{
        cursor:text;
        width:calc(100% - 10px);
        max-width:100%;
        box-sizing:border-box;
        border:1px solid #3a3a3a;
        background:#232323;
        border-radius:24px;
        padding:8px 10px 6px;
        box-shadow:0 9px 9px 0 rgba(0,0,0,0.02),0 2px 5px 0 rgba(0,0,0,0.12);
      }
      .${POPUP_CLASS} .composer-shell:focus-within{
        border-color:#4a4a4a;
        box-shadow:0 0 0 1px rgba(0,154,199,0.35),0 9px 9px 0 rgba(0,0,0,0.02),0 2px 5px 0 rgba(0,0,0,0.12);
      }
      .${POPUP_CLASS} .composer-input{
        width:100%;
        min-height:44px;
        max-height:140px;
        resize:none;
        border:none;
        background:transparent;
        color:#e8e8e8;
        font-size:18px;
        line-height:1.35;
        padding:8px 8px 6px;
        outline:none;
        font-family:inherit;
      }
      .${POPUP_CLASS} .composer-input::placeholder{color:#8a8a8a;font-size:18px;}
      .${POPUP_CLASS} .composer-row{
        margin:2px 0 2px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        min-width:0;
      }
      .${POPUP_CLASS} .composer-left{
        display:flex;
        align-items:center;
        gap:6px;
        min-width:0;
        flex:1 1 auto;
        overflow-x:auto;
        scrollbar-width:none;
      }
      .${POPUP_CLASS} .composer-left::-webkit-scrollbar{display:none;}
      .${POPUP_CLASS} .composer-left > :not(#fab-voice){display:none !important;}
      .${POPUP_CLASS} .composer-icon-btn{
        width:34px;height:34px;border-radius:999px;
        border:1px solid #3a3a3a;
        background:#2a2a2a;color:#b6b6b6;
        cursor:pointer;display:flex;align-items:center;justify-content:center;
        padding:0;transition:border-color .15s,color .15s,background .15s;
        flex:0 0 auto;
      }
      .${POPUP_CLASS} .composer-icon-btn:hover{border-color:#555;color:#e0e0e0;background:#303030;}
      .${POPUP_CLASS} .composer-icon-btn[data-active="true"]{border-color:#009AC7;color:#009AC7;background:#1f2d31;}
      .${POPUP_CLASS} .composer-chip-btn{
        height:34px;border-radius:999px;border:1px solid #3a3a3a;
        background:#2a2a2a;color:#b6b6b6;padding:0 10px;font-size:12px;
        cursor:pointer;display:flex;align-items:center;gap:6px;
        flex:0 0 auto;
      }
      .${POPUP_CLASS} .composer-chip-btn:hover{border-color:#555;color:#e0e0e0;background:#303030;}
      .${POPUP_CLASS} .send-btn{width:36px;height:36px;border-radius:50%;border:none;background:#009AC7;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}
      .${POPUP_CLASS} .send-btn:disabled{opacity:.45;cursor:not-allowed;}
      @media (max-width:420px){
        .${POPUP_CLASS} .composer-shell{padding:7px 8px 5px;}
        .${POPUP_CLASS} .composer-row{gap:6px;}
        .${POPUP_CLASS} .composer-chip-btn{width:34px;padding:0;justify-content:center;}
        .${POPUP_CLASS} .composer-chip-btn span{display:none;}
      }
      .${POPUP_CLASS} .fab-error{color:#ff8a80;font-size:0.82rem;padding:0 10px 6px;display:none;}
      .${POPUP_CLASS} .fab-status{font-size:0.75rem;color:#888;padding:4px 10px;display:none;}
      .${POPUP_CLASS} .empty-hint{text-align:center;color:#666;font-size:0.85rem;padding:24px 12px;}
      .${POPUP_CLASS} .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:18px 10px 10px;}
      .${POPUP_CLASS} .empty-welcome-img{display:block;width:72px;height:72px;object-fit:contain;margin:0 auto 10px;user-select:none;-webkit-user-drag:none;}
      .${POPUP_CLASS} .empty-welcome{font-size:1rem;font-weight:600;color:#d8d8d8;text-align:center;margin-bottom:8px;}
      .${POPUP_CLASS} .empty-sub{font-size:0.85rem;color:#888;text-align:center;margin-bottom:14px;}
      .${POPUP_CLASS} .prompt-suggestions{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;max-width:96%;}
      .${POPUP_CLASS} .prompt-suggestion{padding:5px 12px;background:transparent;border:1px solid #3a3a3a;color:#aaa;border-radius:16px;cursor:pointer;font-size:0.82rem;font-family:inherit;white-space:nowrap;transition:border-color .15s,color .15s;}
      .${POPUP_CLASS} .prompt-suggestion:hover{border-color:#009AC7;color:#009AC7;}
    `;
    r.appendChild(style);
  }

  function getOverlayRoot() {
    const ha = document.querySelector('home-assistant');
    if (ha && ha.shadowRoot) return ha.shadowRoot;
    return document.body;
  }

  function cleanupLegacyOverlays() {
    const root = getOverlayRoot();
    if (!root || !root.querySelectorAll) return;
    const legacy = root.querySelectorAll(`.${OVERLAY_CLASS}:not([data-owner="ha-chat-fab"]), .${BACKDROP_CLASS}:not([data-owner="ha-chat-fab"]), .${POPUP_CLASS}:not([data-owner="ha-chat-fab"])`);
    legacy.forEach((el) => {
      try { el.remove(); } catch (_) {}
    });
  }

  function createIconEl(iconName) {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';

    const haIcon = document.createElement('ha-icon');
    haIcon.setAttribute('icon', iconName || 'mdi:chat');
    wrap.appendChild(haIcon);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H5.17L4,17.17V4H20V16Z');
    svg.appendChild(path);
    svg.style.display = 'none';
    wrap.appendChild(svg);

    setTimeout(() => {
      const upgraded = !!(customElements.get('ha-icon') && haIcon.shadowRoot);
      if (!upgraded) {
        haIcon.style.display = 'none';
        svg.style.display = 'block';
      }
    }, 0);

    return wrap;
  }

  class HaChatFabCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      this._hass = null;
      this._overlayEl = null;
      this._backdropEl = null;
      this._popupEl = null;
      this._open = false;
      this._instanceId = 'fab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      this._apiPathPrefix = null;
      this._resolvePromise = null;
      this._sessionId = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
      this._chatId = null;
      this._thread = [];
      this._boundThreadClick = null;
      this._speechRec = null;
      this._speechListening = false;
      this._voiceSendDebounceMs = 700;
      this._voiceSendTimer = null;
      this._wakewordStream = null;
      this._wakewordAudioCtx = null;
      this._wakewordProcessor = null;
      this._wakewordLastTrigger = 0;
      this.shadowRoot.innerHTML = `<style>:host{display:block;width:0;height:0;overflow:hidden;}</style>`;
    }

    static getStubConfig() {
      return {
        addon_slug: '2954ddb4_ha_chat',
        icon: 'mdi:chat',
        title: 'HA Chat',
      };
    }

    getCardSize() {
      return 0;
    }

    set hass(hass) {
      this._hass = hass || null;
    }

    _haAccessToken() {
      try {
        const h = this._hass;
        if (!h) return '';
        const t1 = h.auth && h.auth.data && h.auth.data.access_token;
        if (typeof t1 === 'string' && t1.trim()) return t1.trim();
        const t2 = h.connection && h.connection.options && h.connection.options.auth && h.connection.options.auth.accessToken;
        if (typeof t2 === 'string' && t2.trim()) return t2.trim();
      } catch (_) {}
      return '';
    }

    _normalizeBearerValue(raw) {
      let t = String(raw == null ? '' : raw).trim();
      if (!t) return '';
      if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
      return t;
    }

    _yamlBearerToken() {
      const c = this._config || {};
      const keys = ['ha_bearer_token', 'bearer_token', 'ha_token'];
      for (let i = 0; i < keys.length; i++) {
        const v = c[keys[i]];
        const n = this._normalizeBearerValue(v);
        if (n) return n;
      }
      return '';
    }

    _authBearer() {
      const fromYaml = this._yamlBearerToken();
      if (fromYaml) return fromYaml;
      return this._haAccessToken();
    }

    _fabTitle() {
      const c = this._config || {};
      const t = typeof c.title === 'string' ? c.title.trim() : '';
      return t || 'HA Chat';
    }

    _welcomeTitle() {
      const c = this._config || {};
      const w = typeof c.welcome_title === 'string' ? c.welcome_title.trim() : '';
      if (w) return w;
      return 'Willkommen im ' + this._fabTitle();
    }

    _welcomeSubtitle() {
      const c = this._config || {};
      const w = typeof c.welcome_subtitle === 'string' ? c.welcome_subtitle.trim() : '';
      if (w) return w;
      return 'Starte mit einem Vorschlag oder schreibe eine eigene Nachricht.';
    }

    _welcomeHandSrc() {
      const c = this._config || {};
      const custom = typeof c.welcome_image_url === 'string' ? c.welcome_image_url.trim() : '';
      if (custom && !isUnavailableHacsHandAssetUrl(custom)) return custom;
      return WELCOME_HAND_PNG_DATA_URI;
    }

    _applyPopupLabels() {
      const name = this._fabTitle();
      if (this._popupEl) {
        const el = this._popupEl.querySelector('#fab-popup-title');
        if (el) el.textContent = name;
      }
      if (this._overlayEl) {
        const btn = this._overlayEl.querySelector('button');
        if (btn) {
          btn.setAttribute('aria-label', name + ' öffnen');
          btn.title = name;
        }
      }
    }

    _addonSlug() {
      const c = this._config || {};
      const s = (typeof c.addon_slug === 'string' && c.addon_slug.trim())
        ? c.addon_slug.trim()
        : (typeof c.slug === 'string' && c.slug.trim() ? c.slug.trim() : '');
      return s || '2954ddb4_ha_chat';
    }

    _directAddonUrl() {
      const c = this._config || {};
      const keys = ['addon_direct_url', 'direct_url', 'addon_port_url'];
      for (let i = 0; i < keys.length; i++) {
        const v = c[keys[i]];
        if (typeof v !== 'string') continue;
        let u = v.trim().replace(/\/$/, '');
        if (!u) continue;
        if (!/^https?:\/\//i.test(u)) continue;
        return u;
      }
      return '';
    }

    _areaScope() {
      const c = this._config || {};
      const keys = ['area_scope', 'ha_area', 'area', 'room'];
      for (let i = 0; i < keys.length; i++) {
        const v = c[keys[i]];
        if (typeof v !== 'string') continue;
        const t = v.trim();
        if (t) return t;
      }
      return '';
    }

    _fabSystemPrompt() {
      const c = this._config || {};
      const keys = ['system_prompt', 'fab_system_prompt', 'prompt'];
      for (let i = 0; i < keys.length; i++) {
        const v = c[keys[i]];
        if (typeof v !== 'string') continue;
        const t = v.trim();
        if (t) return t;
      }
      return '';
    }

    setConfig(config) {
      this._config = config || {};
      this._apiPathPrefix = null;
      this._resolvePromise = null;
      if (this._popupEl) {
        this._unmountPopup();
        if (this._open) {
          this._mountPopup();
          this._syncBackdrop();
          this._applyLayerZIndex();
        }
      }
      this._updateOverlay();
    }

    connectedCallback() {
      ensureStyles(document.head || document.documentElement);
      ensureStyles(getOverlayRoot());
      cleanupLegacyOverlays();
      this._mountOverlay();
      this._updateOverlay();
    }

    disconnectedCallback() {
      this._unmountOverlay();
      this._unmountPopup();
      this._unmountBackdrop();
      this._stopWakewordListener();
    }

    _apiUrl(path) {
      const p = path.startsWith('/') ? path : '/' + path;
      return (this._apiPathPrefix || '') + p;
    }

    _fetchIngressPath() {
      const slug = this._addonSlug();
      const url = '/api/hassio_addon_ingress_path/' + encodeURIComponent(slug);
      const token = this._authBearer();
      const headers = token ? { Authorization: 'Bearer ' + token } : undefined;
      return fetch(url, { ...fetchOpts, headers }).then((r) => {
        if (!r.ok) {
          return r.text().then((t) => {
            throw new Error('Ingress-Pfad (HTTP ' + r.status + '): Integration aktiv? ' + (t && t.length < 80 ? t : ''));
          });
        }
        return r.text();
      }).then((text) => {
        let t = (text || '').trim().replace(/^\uFEFF/, '');
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          try { t = JSON.parse(t); } catch (_) { t = t.slice(1, -1); }
        }
        t = String(t).trim().replace(/\/$/, '');
        if (!t || t[0] !== '/' || t.startsWith('<')) {
          throw new Error('Ungültiger Ingress-Pfad von hassio_addon_ingress_path');
        }
        return t;
      });
    }

    _ensureApiBase() {
      const direct = this._directAddonUrl();
      if (direct) {
        this._apiPathPrefix = direct;
        return Promise.resolve(direct);
      }
      if (this._apiPathPrefix) return Promise.resolve(this._apiPathPrefix);
      if (this._resolvePromise) return this._resolvePromise;
      const self = this;
      this._resolvePromise = this._fetchIngressPath()
        .then((prefix) => {
          self._apiPathPrefix = prefix;
          return prefix;
        })
        .finally(() => {
          self._resolvePromise = null;
        });
      return this._resolvePromise;
    }

    _fetchApi(path, init, canRetry) {
      const self = this;
      const mayRetry = canRetry !== false;
      const token = this._authBearer();
      const addAuth = (opts) => {
        const o = { ...(opts || {}) };
        const h = { ...(o.headers || {}) };
        if (token && !h.Authorization) h.Authorization = 'Bearer ' + token;
        o.headers = h;
        return o;
      };
      const skipIngressRetry = !!self._directAddonUrl();
      return this._ensureApiBase()
        .then(() => fetch(this._apiUrl(path), { ...fetchOpts, ...addAuth(init) }))
        .then((res) => {
          if (mayRetry && !skipIngressRetry && (res.status === 401 || res.status === 403)) {
            self._apiPathPrefix = null;
            return self._ensureApiBase()
              .then(() => fetch(self._apiUrl(path), { ...fetchOpts, ...addAuth(init) }));
          }
          return res;
        });
    }

    _showStatus(msg, isError) {
      if (!this._popupEl) return;
      const el = this._popupEl.querySelector('.fab-status');
      const err = this._popupEl.querySelector('.fab-error');
      if (!el) return;
      el.style.display = msg ? 'block' : 'none';
      el.textContent = msg || '';
      el.style.color = isError ? '#ff8a80' : '#888';
      if (err && isError) err.style.display = 'none';
    }

    _showError(msg) {
      if (!this._popupEl) return;
      const el = this._popupEl.querySelector('.fab-error');
      if (!el) return;
      el.style.display = msg ? 'block' : 'none';
      el.textContent = msg || '';
      this._showStatus('', false);
    }

    _mountOverlay() {
      if (this._overlayEl) return;
      const root = getOverlayRoot();
      const host = document.createElement('div');
      host.className = OVERLAY_CLASS;
      host.setAttribute('data-instance', this._instanceId);
      host.setAttribute('data-owner', 'ha-chat-fab');
      host.style.display = 'flex';

      const btn = document.createElement('button');
      btn.type = 'button';

      const iconName = (this._config && typeof this._config.icon === 'string' && this._config.icon.trim())
        ? this._config.icon.trim()
        : 'mdi:chat';
      btn.appendChild(createIconEl(iconName));

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._togglePopup();
      }, true);

      host.appendChild(btn);
      root.appendChild(host);
      this._overlayEl = host;
      this._applyPopupLabels();
    }

    _mountBackdrop() {
      if (this._backdropEl) return;
      const root = getOverlayRoot();
      const bd = document.createElement('div');
      bd.className = BACKDROP_CLASS;
      bd.setAttribute('data-owner', 'ha-chat-fab');
      bd.setAttribute('data-instance', this._instanceId);
      bd.setAttribute('data-open', 'false');
      bd.setAttribute('aria-hidden', 'true');
      bd.tabIndex = -1;
      bd.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._setOpen(false);
      });
      root.appendChild(bd);
      this._backdropEl = bd;
    }

    _syncBackdrop() {
      if (!this._backdropEl) return;
      if (this._open) {
        this._backdropEl.setAttribute('data-open', 'true');
        this._backdropEl.style.display = 'block';
      } else {
        this._backdropEl.setAttribute('data-open', 'false');
        this._backdropEl.style.display = 'none';
      }
    }

    _unmountBackdrop() {
      if (this._backdropEl && this._backdropEl.parentNode) {
        this._backdropEl.parentNode.removeChild(this._backdropEl);
      }
      this._backdropEl = null;
    }

    _applyLayerZIndex() {
      const z = (this._config && typeof this._config.zIndex === 'number') ? this._config.zIndex : 100000;
      if (this._overlayEl) this._overlayEl.style.zIndex = String(z);
      if (this._backdropEl) this._backdropEl.style.zIndex = String(z - 1);
      if (this._popupEl) this._popupEl.style.zIndex = String(z);
    }

    _mountPopup() {
      if (this._popupEl) return;
      const root = getOverlayRoot();
      this._mountBackdrop();
      const pop = document.createElement('div');
      pop.className = POPUP_CLASS;
      pop.setAttribute('data-instance', this._instanceId);
      pop.setAttribute('data-owner', 'ha-chat-fab');
      pop.setAttribute('data-open', 'false');

      pop.innerHTML = `
        <div class="head">
          <div class="title" id="fab-popup-title"></div>
          <button class="btn" type="button" aria-label="Schließen" title="Schließen">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"></path></svg>
          </button>
        </div>
        <div class="fab-status"></div>
        <div class="body">
          <div class="thread" id="fab-thread"><div class="msg-col" id="fab-msg-col"></div></div>
          <div class="fab-error"></div>
          <div class="composer">
            <div class="composer-shell">
              <textarea id="fab-input" class="composer-input" rows="1" placeholder="Nachricht …"></textarea>
              <div class="composer-row">
                <div class="composer-left">
                  <button type="button" class="composer-icon-btn" id="fab-voice" title="Spracheingabe" aria-label="Spracheingabe">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M9 21h6"/></svg>
                  </button>
                </div>
                <button type="button" class="send-btn" id="fab-send" title="Senden" aria-label="Senden">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      pop.querySelector('.head .btn').addEventListener('click', () => this._setOpen(false));
      pop.querySelector('#fab-send').addEventListener('click', () => this._send());
      const inputEl = pop.querySelector('#fab-input');
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._send();
        }
      });
      inputEl.addEventListener('input', () => this._autoGrowComposerInput());
      const voiceBtn = pop.querySelector('#fab-voice');
      if (voiceBtn) voiceBtn.addEventListener('click', () => this._toggleVoiceInput());

      this._boundThreadClick = (e) => {
        const ub = e.target.closest('button[data-utterance]');
        if (ub) this._runAction(ub.dataset.utterance);
        const img = e.target.closest('img.chat-img');
        if (img && img.parentElement && img.parentElement.classList.contains('img-wrapper')) {
          img.parentElement.classList.add('loaded');
        }
      };
      pop.querySelector('#fab-thread').addEventListener('click', this._boundThreadClick);

      root.appendChild(pop);
      this._popupEl = pop;
      this._applyPopupLabels();
      this._autoGrowComposerInput();
    }

    _unmountPopup() {
      this._stopVoiceInput();
      if (this._backdropEl) {
        this._backdropEl.setAttribute('data-open', 'false');
        this._backdropEl.style.display = 'none';
      }
      if (this._popupEl && this._popupEl.parentNode) {
        if (this._boundThreadClick) {
          const th = this._popupEl.querySelector('#fab-thread');
          if (th) th.removeEventListener('click', this._boundThreadClick);
        }
        this._popupEl.parentNode.removeChild(this._popupEl);
      }
      this._popupEl = null;
      this._boundThreadClick = null;
    }

    _togglePopup() {
      this._setOpen(!this._open);
    }

    _setOpen(open) {
      this._open = !!open;
      if (!this._open) this._stopVoiceInput();
      this._mountPopup();
      if (!this._popupEl) return;
      this._popupEl.setAttribute('data-open', this._open ? 'true' : 'false');
      if (this._overlayEl) this._overlayEl.style.display = this._open ? 'none' : 'flex';
      this._mountBackdrop();
      this._syncBackdrop();
      this._applyLayerZIndex();

      if (this._open) {
        const self = this;
        this._showStatus('Verbinde …', false);
        this._ensureApiBase()
          .then(() => {
            self._showStatus('', false);
            self._showError('');
            self._chatId = null;
            self._thread = [];
            return self._createNewChat(true);
          })
          .catch((e) => {
            self._showStatus((e && e.message) || String(e), true);
            self._renderThread();
          });
      }
    }

    _createNewChat(focusInput) {
      const self = this;
      return this._fetchApi('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
        .then((r) => parseJsonResponse(r))
        .then((d) => {
          if (!d.chat || !d.chat.id) {
            self._showError('Neuer Chat: ungültige Server-Antwort');
            return;
          }
          self._chatId = d.chat.id;
          self._thread = [];
        })
        .then(() => {
          self._renderThread();
          if (focusInput) {
            const inp = self._popupEl && self._popupEl.querySelector('#fab-input');
            if (inp) inp.focus();
          }
        })
        .catch((e) => {
          self._showError('Neuer Chat: ' + (e.message || e));
        });
    }

    _renderThread() {
      const col = this._popupEl && this._popupEl.querySelector('#fab-msg-col');
      const threadEl = this._popupEl && this._popupEl.querySelector('#fab-thread');
      if (!col) return;
      const prefix = this._apiPathPrefix || '';
      col.innerHTML = '';

      if (!this._apiPathPrefix) {
        col.innerHTML = '<div class="empty-hint">Ingress-Pfad wird geladen oder fehlt (Integration prüfen).</div>';
        return;
      }

      if (this._thread.length === 0) {
        const suggestions = PROMPT_SUGGESTIONS
          .map((s) => '<button type="button" class="prompt-suggestion" data-suggestion="' + escapeAttr(s) + '">' + escapeHtml(s) + '</button>')
          .join('');
        const handSrc = this._welcomeHandSrc();
        const handImg = handSrc
          ? '<img class="empty-welcome-img" src="' + escapeAttr(handSrc) + '" alt="" width="72" height="72" decoding="async" />'
          : '';
        col.innerHTML = ''
          + '<div class="empty-state">'
          + handImg
          + '<div class="empty-welcome">' + escapeHtml(this._welcomeTitle()) + '</div>'
          + '<div class="empty-sub">' + escapeHtml(this._welcomeSubtitle()) + '</div>'
          + '<div class="prompt-suggestions">' + suggestions + '</div>'
          + '</div>';
        col.querySelectorAll('button[data-suggestion]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const inp = this._popupEl && this._popupEl.querySelector('#fab-input');
            if (!inp) return;
            inp.value = btn.getAttribute('data-suggestion') || '';
            inp.focus();
          });
        });
        if (threadEl) threadEl.scrollTop = 0;
        return;
      }

      this._thread.forEach((m) => {
        const div = document.createElement('div');
        div.className = 'msg ' + m.role;
        if (m.pending) {
          div.innerHTML = '<div class="content"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
        } else {
          let bodyHtml;
          if (m.role === 'assistant') bodyHtml = renderMarkdown(m.content, prefix);
          else bodyHtml = escapeHtml(m.content);
          let html = '<div class="content">' + bodyHtml + '</div>';
          if (m.sources && m.sources.length) {
            html += '<div class="sources">' + m.sources.map((s) => (s.url
              ? '<a target="_blank" rel="noopener" href="' + escapeAttr(s.url) + '" class="badge content-link">' + escapeHtml(s.title || 'Link') + '</a>'
              : '<span class="badge content-link" style="opacity:.7">' + escapeHtml(s.title || '') + '</span>'
            )).join('') + '</div>';
          }
          if (m.actions && m.actions.length) {
            html += '<div class="actions">';
            m.actions.forEach((a, idx) => {
              html += '<button type="button" data-utterance="' + escapeAttr(a.utterance || '') + '">' + escapeHtml(a.label || a.utterance || ('Aktion ' + (idx + 1))) + '</button>';
            });
            html += '</div>';
          }
          div.innerHTML = html;
        }
        col.appendChild(div);
      });
      col.querySelectorAll('img.chat-img').forEach((img) => {
        img.addEventListener('load', function () {
          const w = this.closest('.img-wrapper');
          if (w) w.classList.add('loaded');
        });
        if (img.complete && img.naturalWidth) {
          const w = img.closest('.img-wrapper');
          if (w) w.classList.add('loaded');
        }
      });
      if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
    }

    _autoGrowComposerInput() {
      const input = this._popupEl && this._popupEl.querySelector('#fab-input');
      if (!input) return;
      input.style.height = '44px';
      const next = Math.min(Math.max(input.scrollHeight, 44), 140);
      input.style.height = String(next) + 'px';
    }

    _stopVoiceInput() {
      this._speechListening = false;
      const btn = this._popupEl && this._popupEl.querySelector('#fab-voice');
      if (btn) btn.setAttribute('data-active', 'false');
      if (this._voiceSendTimer) {
        clearTimeout(this._voiceSendTimer);
        this._voiceSendTimer = null;
      }
      if (this._speechRec) {
        try { this._speechRec.stop(); } catch (_) {}
        this._speechRec = null;
      }
    }

    _stopWakewordListener() {
      if (this._wakewordProcessor) {
        try { this._wakewordProcessor.disconnect(); } catch (_) {}
        this._wakewordProcessor = null;
      }
      if (this._wakewordAudioCtx) {
        try { this._wakewordAudioCtx.close(); } catch (_) {}
        this._wakewordAudioCtx = null;
      }
      if (this._wakewordStream) {
        try {
          this._wakewordStream.getTracks().forEach((t) => t.stop());
        } catch (_) {}
        this._wakewordStream = null;
      }
    }

    _onWakeTrigger() {
      const now = Date.now();
      if (now - this._wakewordLastTrigger < 15000) return;
      this._wakewordLastTrigger = now;
      if (!this._open) this._setOpen(true);
      const inp = this._popupEl && this._popupEl.querySelector('#fab-input');
      if (inp) inp.focus();
    }

    _ensureWakewordListener() {
      if (this._wakewordProcessor || this._wakewordStream) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      const self = this;
      const loadLib = () => {
        if (WEB_WAKEWORD_LOADED || (typeof window !== 'undefined' && typeof window.WebWakeWord !== 'undefined')) {
          WEB_WAKEWORD_LOADED = true;
          return Promise.resolve();
        }
        if (WEB_WAKEWORD_LOADING) return WEB_WAKEWORD_LOADING;
        WEB_WAKEWORD_LOADING = new Promise((resolve, reject) => {
          try {
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/web-wake-word/dist/web-wake-word.umd.js';
            s.async = true;
            s.onload = () => {
              WEB_WAKEWORD_LOADED = true;
              WEB_WAKEWORD_LOADING = null;
              resolve();
            };
            s.onerror = (e) => {
              WEB_WAKEWORD_LOADING = null;
              reject(e || new Error('web-wake-word Laden fehlgeschlagen'));
            };
            (document.head || document.documentElement).appendChild(s);
          } catch (e) {
            WEB_WAKEWORD_LOADING = null;
            reject(e);
          }
        });
        return WEB_WAKEWORD_LOADING;
      };

      loadLib()
        .then(() => {
          if (typeof window === 'undefined' || typeof window.WebWakeWord === 'undefined') return;
          return navigator.mediaDevices.getUserMedia({ audio: true }).then(async (stream) => {
            try {
              self._wakewordStream = stream;
              const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              self._wakewordAudioCtx = audioCtx;
              const source = audioCtx.createMediaStreamSource(stream);

              const WW = window.WebWakeWord;
              const model = await WW.createModel();
              const recognizer = await WW.createRecognizer({
                audioContext: audioCtx,
                model,
              });

              recognizer.on('wakeword', function () {
                self._onWakeTrigger();
              });

              recognizer.listen(source);
              self._wakewordProcessor = recognizer;
            } catch (_) {
              self._stopWakewordListener();
            }
          });
        })
        .catch(() => {});
    }

    _toggleVoiceInput() {
      if (this._speechListening) {
        this._stopVoiceInput();
        this._showStatus('', false);
        return;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this._showError('Spracheingabe wird vom Browser nicht unterstützt.');
        return;
      }
      const input = this._popupEl && this._popupEl.querySelector('#fab-input');
      if (!input) return;
      const baseTextBeforeVoice = (input.value || '').trim();
      this._ensureWakewordListener();
      const rec = new SpeechRecognition();
      this._speechRec = rec;
      this._speechListening = true;
      rec.lang = (this._hass && this._hass.language) || 'de-DE';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      const btn = this._popupEl && this._popupEl.querySelector('#fab-voice');
      if (btn) btn.setAttribute('data-active', 'true');
      this._showStatus('Spracheingabe läuft …', false);
      let finalText = '';
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const txt = (ev.results[i][0] && ev.results[i][0].transcript) ? ev.results[i][0].transcript : '';
          if (ev.results[i].isFinal) finalText += txt;
          else interim += txt;
        }
        const spoken = (finalText + interim).trim();
        input.value = spoken
          ? ((baseTextBeforeVoice ? baseTextBeforeVoice + ' ' : '') + spoken).trim()
          : baseTextBeforeVoice;
        this._autoGrowComposerInput();
      };
      rec.onerror = (e) => {
        if (this._voiceSendTimer) {
          clearTimeout(this._voiceSendTimer);
          this._voiceSendTimer = null;
        }
        this._showStatus('', false);
        this._showError('Spracheingabe: ' + (e && e.error ? e.error : 'Fehler'));
      };
      rec.onend = () => {
        this._speechListening = false;
        if (btn) btn.setAttribute('data-active', 'false');
        this._showStatus('', false);
        this._autoGrowComposerInput();
        this._speechRec = null;
        const txt = (input.value || '').trim();
        if (!txt) return;
        if (this._voiceSendTimer) clearTimeout(this._voiceSendTimer);
        this._voiceSendTimer = setTimeout(() => {
          this._voiceSendTimer = null;
          const current = (input.value || '').trim();
          if (!current) return;
          this._send();
        }, this._voiceSendDebounceMs);
      };
      try {
        rec.start();
      } catch (e) {
        this._showError('Spracheingabe konnte nicht gestartet werden.');
        this._stopVoiceInput();
      }
    }

    _send() {
      const input = this._popupEl && this._popupEl.querySelector('#fab-input');
      const sendBtn = this._popupEl && this._popupEl.querySelector('#fab-send');
      if (!input || !sendBtn || !this._apiPathPrefix) return;
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      this._autoGrowComposerInput();
      this._thread.push({ role: 'user', content: text, sources: [], actions: [], pending: false });
      this._thread.push({ role: 'assistant', content: '', sources: [], actions: [], pending: true });
      this._renderThread();
      sendBtn.disabled = true;
      this._showError('');
      const self = this;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      this._fetchApi('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: self._sessionId,
          chat_id: self._chatId,
          area_scope: self._areaScope() || undefined,
          system_prompt: self._fabSystemPrompt() || undefined,
        }),
        signal: controller.signal,
      })
        .then((r) => { clearTimeout(timer); return parseJsonResponse(r); })
        .then((d) => {
          if (d.error) {
            self._showError(d.error);
            self._popPendingAssistant('Fehler: ' + d.error);
          } else {
            self._popPendingAssistant(d.answer || '', d.sources || [], d.actions || []);
            if (d.chat_id && d.chat_id !== self._chatId) self._chatId = d.chat_id;
          }
        })
        .catch((e) => {
          clearTimeout(timer);
          self._showError(e.message || String(e));
          self._popPendingAssistant(
            e.name === 'AbortError' ? 'Zeitüberschreitung.' : 'Anfrage fehlgeschlagen.'
          );
        })
        .finally(() => { sendBtn.disabled = false; });
    }

    _popPendingAssistant(content, sources, actions) {
      for (let i = this._thread.length - 1; i >= 0; i--) {
        if (this._thread[i].role === 'assistant' && this._thread[i].pending) {
          this._thread[i].pending = false;
          this._thread[i].content = content || '';
          this._thread[i].sources = sources || [];
          this._thread[i].actions = actions || [];
          break;
        }
      }
      this._renderThread();
    }

    _runAction(utterance) {
      if (!utterance || !this._apiPathPrefix) return;
      this._thread.push({ role: 'user', content: utterance, sources: [], actions: [], pending: false });
      this._thread.push({ role: 'assistant', content: '', sources: [], actions: [], pending: true });
      this._renderThread();
      const sendBtn = this._popupEl && this._popupEl.querySelector('#fab-send');
      if (sendBtn) sendBtn.disabled = true;
      const self = this;
      this._fetchApi('/api/execute_action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterance: utterance,
          session_id: self._sessionId,
          chat_id: self._chatId,
          area_scope: self._areaScope() || undefined,
          system_prompt: self._fabSystemPrompt() || undefined,
        }),
      })
        .then((r) => parseJsonResponse(r))
        .then((d) => {
          if (d.error) {
            self._showError(d.error);
            self._popPendingAssistant('Fehler: ' + d.error);
          } else {
            const ans = d.answer != null ? d.answer : (d.response != null ? d.response : '');
            self._popPendingAssistant(ans, d.sources || [], d.actions || []);
            if (d.chat_id && d.chat_id !== self._chatId) self._chatId = d.chat_id;
          }
        })
        .catch((e) => {
          self._showError(e.message || String(e));
          self._popPendingAssistant('Aktion fehlgeschlagen.');
        })
        .finally(() => { if (sendBtn) sendBtn.disabled = false; });
    }

    _unmountOverlay() {
      if (this._overlayEl && this._overlayEl.parentNode) {
        this._overlayEl.parentNode.removeChild(this._overlayEl);
      }
      this._overlayEl = null;
    }

    _updateOverlay() {
      this._applyLayerZIndex();
      this._applyPopupLabels();
      if (!this._overlayEl) return;

      const iconName = (this._config && typeof this._config.icon === 'string' && this._config.icon.trim())
        ? this._config.icon.trim()
        : 'mdi:chat';
      const haIcon = this._overlayEl.querySelector('ha-icon');
      if (haIcon) haIcon.setAttribute('icon', iconName);
    }
  }

  customElements.define('ha-chat-fab', HaChatFabCard);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'ha-chat-fab',
    name: 'HA Chat FAB',
    description: 'Floating chat; ingress path + optional direct port. Welcome image embedded (build 3, no hand.png fetch).',
  });
})();
