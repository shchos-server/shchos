const comment = document.querySelector("#comment");
const commentCounter = document.querySelector("#comment-counter");

function handleTCommentChange() {
  const minLength = comment.getAttribute("minlength");
  const length = comment.value.trim().length;
  console.log(length, minLength);
  if (length <= minLength) {
    commentCounter.style.color = "#f00";
  } else {
    commentCounter.style.color = "rgb(137, 137, 137)";
  }
  commentCounter.innerText = `${length}`;
}

comment.addEventListener("input", handleTCommentChange);
