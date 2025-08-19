window.addEventListener('load', () => {
  const container = document.getElementById('board-container');
  const boardImg = new Image();
  boardImg.src = 'board.png';
  boardImg.onload = () => {
    const nw = boardImg.naturalWidth;
    const nh = boardImg.naturalHeight;
    const svgNS = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const image = document.createElementNS(svgNS, 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'board.png');
    image.setAttribute('x', 0);
    image.setAttribute('y', 0);
    image.setAttribute('width', nw);
    image.setAttribute('height', nh);
    svg.appendChild(image);

    // Example token
    const token = document.createElementNS(svgNS, 'circle');
    token.setAttribute('cx', 100);
    token.setAttribute('cy', 100);
    token.setAttribute('r', 20);
    token.setAttribute('class', 'token');
    svg.appendChild(token);

    container.appendChild(svg);
  };
});
